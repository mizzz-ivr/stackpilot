import ts from 'typescript';

const usageVariableName = 'stackpilotIpcChannelUsages';
const allowedUsageModes = new Set(['invoke', 'event']);
const operationNames = {
  mainHandle: 'main-handle',
  mainSend: 'main-send',
  preloadInvoke: 'preload-invoke',
  preloadOn: 'preload-on',
  preloadRemoveListener: 'preload-remove-listener'
};

export const readIpcUsageContract = (
  sourceText,
  filePath = 'shared/domain/ipcChannels.ts'
) => {
  const sourceFile = createSourceFile(filePath, sourceText);
  const errors = [];
  let declaration;

  walkSource(sourceFile, (node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      node.name.text !== usageVariableName
    ) {
      return;
    }

    if (declaration) {
      errors.push(`${filePath}: ${usageVariableName}の定義が複数あります。`);
    } else {
      declaration = node;
    }
  });

  if (!declaration?.initializer) {
    return {
      modes: new Map(),
      errors: [`${filePath}: ${usageVariableName}が見つかりません。`]
    };
  }

  const { expression, hasUsageContract } = unwrapContractInitializer(declaration.initializer);
  if (!hasUsageContract) {
    errors.push(
      `${filePath}: ${usageVariableName}へRecord<keyof StackpilotIpcChannels, StackpilotIpcChannelUsage>のsatisfiesを指定してください。`
    );
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    errors.push(`${filePath}: ${usageVariableName}はobject literalで定義してください。`);
    return { modes: new Map(), errors };
  }

  const modes = new Map();
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      errors.push(`${filePath}: 利用種別定義ではspread・method・shorthandを使用できません。`);
      continue;
    }

    const key = readPropertyName(property.name);
    if (!key) {
      errors.push(`${filePath}: channel keyはidentifierまたは文字列literalで指定してください。`);
      continue;
    }
    if (modes.has(key)) {
      errors.push(`${filePath}: channel key「${key}」の利用種別が重複しています。`);
      continue;
    }

    const initializer = unwrapExpression(property.initializer);
    if (!ts.isStringLiteralLike(initializer) || !allowedUsageModes.has(initializer.text)) {
      errors.push(`${filePath}: channel「${key}」の利用種別は'invoke'または'event'で指定してください。`);
      continue;
    }
    modes.set(key, initializer.text);
  }

  return { modes, errors };
};

export const analyzeIpcUsageSource = ({ sourceText, filePath, side }) => {
  const sourceFile = createSourceFile(filePath, sourceText);
  const usages = [];
  const errors = [];

  walkSource(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;

    const operation = classifyIpcOperation(node.expression, side);
    if (!operation) return;

    const location = formatLocation(sourceFile, node);
    if (operation.startsWith('unsupported:')) {
      errors.push(
        `${location.text}: 未対応のIPC API「${operation.slice('unsupported:'.length)}」を使用しています。`
      );
      return;
    }

    const channelReference = readChannelReference(node.arguments[0]);
    if (channelReference.kind === 'channel') {
      usages.push({
        key: channelReference.key,
        operation,
        filePath,
        line: location.line,
        column: location.column
      });
      return;
    }

    if (channelReference.kind === 'direct-string') {
      errors.push(
        `${location.text}: IPC channel「${channelReference.value}」を直接文字列で指定せずCHANNELSを使用してください。`
      );
      return;
    }

    errors.push(`${location.text}: IPC APIの第1引数はCHANNELS.<key>で指定してください。`);
  });

  return { usages, errors };
};

export const validateIpcUsageCoverage = ({ modes, mainResults, preloadResults }) => {
  const errors = [
    ...mainResults.flatMap((result) => result.errors),
    ...preloadResults.flatMap((result) => result.errors)
  ];
  const usages = [
    ...mainResults.flatMap((result) => result.usages),
    ...preloadResults.flatMap((result) => result.usages)
  ];
  const knownUsages = [];

  for (const usage of usages) {
    if (!modes.has(usage.key)) {
      errors.push(`${formatUsageLocation(usage)}: 未定義のchannel key「${usage.key}」を使用しています。`);
    } else {
      knownUsages.push(usage);
    }
  }

  const modeCounts = { invoke: 0, event: 0 };

  for (const [key, mode] of modes) {
    modeCounts[mode] += 1;
    const channelUsages = knownUsages.filter((usage) => usage.key === key);
    const counts = countOperations(channelUsages);

    if (mode === 'invoke') {
      validateInvokeChannel(errors, key, channelUsages, counts);
    } else {
      validateEventChannel(errors, key, channelUsages, counts);
    }
  }

  return {
    errors,
    summary: {
      totalChannels: modes.size,
      invokeChannels: modeCounts.invoke,
      eventChannels: modeCounts.event,
      totalUsages: knownUsages.length
    }
  };
};

const validateInvokeChannel = (errors, key, usages, counts) => {
  if (counts[operationNames.mainHandle] !== 1) {
    errors.push(
      `channel「${key}」はinvokeのためipcMain.handleが1件必要です（検出: ${counts[operationNames.mainHandle]}件）。`
    );
  }
  if (counts[operationNames.preloadInvoke] < 1) {
    errors.push(`channel「${key}」はinvokeのためipcRenderer.invokeが必要です。`);
  }

  reportForbiddenOperations(
    errors,
    usages,
    new Set([
      operationNames.mainSend,
      operationNames.preloadOn,
      operationNames.preloadRemoveListener
    ]),
    'invoke'
  );
};

const validateEventChannel = (errors, key, usages, counts) => {
  if (counts[operationNames.mainSend] < 1) {
    errors.push(`channel「${key}」はeventのためwebContents.sendが必要です。`);
  }
  if (counts[operationNames.preloadOn] < 1) {
    errors.push(`channel「${key}」はeventのためipcRenderer.onが必要です。`);
  }
  if (counts[operationNames.preloadOn] !== counts[operationNames.preloadRemoveListener]) {
    errors.push(
      `channel「${key}」の購読数と解除数が一致しません: on=${counts[operationNames.preloadOn]}, removeListener=${counts[operationNames.preloadRemoveListener]}`
    );
  }

  reportForbiddenOperations(
    errors,
    usages,
    new Set([operationNames.mainHandle, operationNames.preloadInvoke]),
    'event'
  );
};

const reportForbiddenOperations = (errors, usages, forbiddenOperations, expectedMode) => {
  for (const usage of usages) {
    if (!forbiddenOperations.has(usage.operation)) continue;
    errors.push(
      `${formatUsageLocation(usage)}: channel「${usage.key}」は${expectedMode}ですが${usage.operation}で使用されています。`
    );
  }
};

const countOperations = (usages) => {
  const counts = Object.fromEntries(Object.values(operationNames).map((operation) => [operation, 0]));
  for (const usage of usages) counts[usage.operation] += 1;
  return counts;
};

const classifyIpcOperation = (expression, side) => {
  if (!ts.isPropertyAccessExpression(expression)) return undefined;

  const method = expression.name.text;
  const receiver = expression.expression;

  if (side === 'main') {
    if (ts.isIdentifier(receiver) && receiver.text === 'ipcMain') {
      if (method === 'handle') return operationNames.mainHandle;
      if (method === 'on' || method === 'once' || method === 'handleOnce') {
        return `unsupported:ipcMain.${method}`;
      }
    }
    if (method === 'send' && isWebContentsReceiver(receiver)) return operationNames.mainSend;
    return undefined;
  }

  if (side === 'preload' && ts.isIdentifier(receiver) && receiver.text === 'ipcRenderer') {
    if (method === 'invoke') return operationNames.preloadInvoke;
    if (method === 'on') return operationNames.preloadOn;
    if (method === 'removeListener') return operationNames.preloadRemoveListener;
    if (['send', 'sendSync', 'once', 'removeAllListeners'].includes(method)) {
      return `unsupported:ipcRenderer.${method}`;
    }
  }

  return undefined;
};

const isWebContentsReceiver = (expression) =>
  ts.isPropertyAccessExpression(expression) && expression.name.text === 'webContents';

const readChannelReference = (expression) => {
  if (!expression) return { kind: 'invalid' };
  const value = unwrapExpression(expression);

  if (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === 'CHANNELS'
  ) {
    return { kind: 'channel', key: value.name.text };
  }

  if (
    ts.isElementAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === 'CHANNELS' &&
    value.argumentExpression &&
    ts.isStringLiteralLike(value.argumentExpression)
  ) {
    return { kind: 'channel', key: value.argumentExpression.text };
  }

  if (ts.isStringLiteralLike(value)) return { kind: 'direct-string', value: value.text };
  return { kind: 'invalid' };
};

const unwrapContractInitializer = (initializer) => {
  let current = initializer;
  let hasUsageContract = false;

  while (true) {
    if (ts.isSatisfiesExpression(current)) {
      const contractText = current.type.getText();
      hasUsageContract ||=
        contractText.includes('StackpilotIpcChannels') &&
        contractText.includes('StackpilotIpcChannelUsage');
      current = current.expression;
      continue;
    }
    if (
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return { expression: current, hasUsageContract };
  }
};

const unwrapExpression = (expression) => {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const readPropertyName = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
};

const createSourceFile = (filePath, sourceText) =>
  ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

const walkSource = (sourceFile, visitor) => {
  const visit = (node) => {
    visitor(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
};

const formatLocation = (sourceFile, node) => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const location = { line: line + 1, column: character + 1 };
  return {
    ...location,
    text: `${sourceFile.fileName}:${location.line}:${location.column}`
  };
};

const formatUsageLocation = (usage) => `${usage.filePath}:${usage.line}:${usage.column}`;
