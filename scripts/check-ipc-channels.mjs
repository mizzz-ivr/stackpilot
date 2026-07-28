import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const contractTypeName = 'StackpilotIpcChannels';
const definitions = [
  { label: 'main process', path: 'electron/main/ipc/channels.ts' },
  { label: 'sandbox preload', path: 'electron/preload/index.ts' }
];

const readChannelDefinition = async ({ label, path }) => {
  const sourceText = await readFile(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors = [];
  let declaration;

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'CHANNELS'
    ) {
      if (declaration) {
        errors.push(`${label}: CHANNELS定義が複数あります。`);
      } else {
        declaration = node;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (!declaration?.initializer) {
    return { label, path, channels: new Map(), errors: [`${label}: CHANNELS定義が見つかりません。`] };
  }

  const { expression, hasContract } = unwrapInitializer(declaration.initializer);
  if (!hasContract) {
    errors.push(`${label}: CHANNELSへ satisfies ${contractTypeName} を指定してください。`);
  }

  const contractImport = sourceFile.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.endsWith('/domain/ipcChannels')
  );
  if (!contractImport || !contractImport.importClause?.isTypeOnly) {
    errors.push(`${label}: ${contractTypeName}はimport typeで読み込んでください。`);
  }

  if (!ts.isObjectLiteralExpression(expression)) {
    errors.push(`${label}: CHANNELSはobject literalで定義してください。`);
    return { label, path, channels: new Map(), errors };
  }

  const channels = new Map();
  const valueOwners = new Map();

  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      errors.push(`${label}: CHANNELSではspread・method・shorthandを使用できません。`);
      continue;
    }

    const key = readPropertyName(property.name);
    if (!key) {
      errors.push(`${label}: channel keyはidentifierまたは文字列literalで指定してください。`);
      continue;
    }
    if (channels.has(key)) {
      errors.push(`${label}: channel key「${key}」が重複しています。`);
      continue;
    }

    const initializer = unwrapExpression(property.initializer);
    if (!ts.isStringLiteralLike(initializer)) {
      errors.push(`${label}: channel「${key}」の値は文字列literalで指定してください。`);
      continue;
    }

    const value = initializer.text;
    const existingOwner = valueOwners.get(value);
    if (existingOwner) {
      errors.push(`${label}: channel値「${value}」が「${existingOwner}」と「${key}」で重複しています。`);
    }
    valueOwners.set(value, key);
    channels.set(key, value);
  }

  return { label, path, channels, errors };
};

const unwrapInitializer = (initializer) => {
  let current = initializer;
  let hasContract = false;

  while (true) {
    if (ts.isSatisfiesExpression(current)) {
      hasContract ||= current.type.getText() === contractTypeName;
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    return { expression: current, hasContract };
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

const results = await Promise.all(definitions.map(readChannelDefinition));
const [mainDefinition, preloadDefinition] = results;
const errors = results.flatMap((result) => result.errors);

const allKeys = new Set([
  ...mainDefinition.channels.keys(),
  ...preloadDefinition.channels.keys()
]);

for (const key of [...allKeys].sort()) {
  const mainValue = mainDefinition.channels.get(key);
  const preloadValue = preloadDefinition.channels.get(key);

  if (mainValue === undefined) {
    errors.push(`main process: channel key「${key}」が不足しています。`);
  } else if (preloadValue === undefined) {
    errors.push(`sandbox preload: channel key「${key}」が不足しています。`);
  } else if (mainValue !== preloadValue) {
    errors.push(`channel「${key}」の値が不一致です: main=${mainValue}, preload=${preloadValue}`);
  }
}

if (errors.length > 0) {
  console.error('IPC channel契約チェックに失敗しました。');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`IPC channel契約チェック成功: ${mainDefinition.channels.size}件のキーと値が一致しています。`);
}
