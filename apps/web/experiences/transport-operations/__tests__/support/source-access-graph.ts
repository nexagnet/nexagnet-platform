import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * DO QUYEN TU MA NGUON (`#395`) — bo phan tich tinh cho `section-access.spec.ts`.
 *
 * Chuoi can khoa co BON mat xich, va mot mat xich lech la mot man hinh noi sai:
 *
 *   1. route may chu → hanh dong (`@RequiresTransportAction` trong controller cua API);
 *   2. ham client → route (`transportApi.fleet.vehicles` → `GET /transport/vehicles`);
 *   3. query cua man hinh → ham client + cong `enabled` (`allowed(input, cap, action)`);
 *   4. muc tren thanh ben → component → moi query no (va cac component con) goi.
 *
 * Tat ca doc tu MA NGUON bang trinh phan tich cua TypeScript, khong co bang go tay nao: them mot
 * query moi vao mot man hinh ma quen khai quyen cua no thi bai do, chu khong phai khach thay mot man
 * trong. Tep nay chi DOC va DUNG DO THI; cac luat nam trong spec.
 */

/* ------------------------------------------------------------------ *
 * Tep nguon
 * ------------------------------------------------------------------ */

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const walkFiles = (dir: string, accept: (path: string) => boolean): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' || name === '__tests__' ? [] : walkFiles(path, accept);
    }
    return accept(path) ? [path] : [];
  });

const stringOf = (node: ts.Node | undefined): string | null =>
  node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;

const decoratorCall = (
  node: ts.HasDecorators,
): readonly { readonly name: string; readonly args: readonly ts.Expression[] }[] =>
  (ts.getDecorators(node) ?? []).flatMap((decorator) => {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
      return [{ name: expression.expression.text, args: [...expression.arguments] }];
    }
    return ts.isIdentifier(expression) ? [{ name: expression.text, args: [] }] : [];
  });

/* ------------------------------------------------------------------ *
 * 1. Route may chu
 * ------------------------------------------------------------------ */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const HTTP_DECORATORS: Readonly<Record<string, HttpMethod>> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
};

/** Tham so duong dan (`:id`, `${...}`) deu thanh `:` — ten tham so khong phai mot phan cua hop dong. */
export const PARAM = ':';

export const toSegments = (path: string): readonly string[] =>
  path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => (segment.startsWith(':') ? PARAM : segment));

export interface ServerRoute {
  readonly method: HttpMethod;
  readonly segments: readonly string[];
  /** `null` = route khong di qua cong hanh dong van tai (vd `/settings/users`, `@Roles` cua nen tang). */
  readonly action: string | null;
  readonly where: string;
}

const joinPath = (...parts: readonly string[]): string =>
  parts
    .flatMap((part) => part.split('/'))
    .filter((part) => part.length > 0)
    .join('/');

export function readServerRoutes(apiSrc: string): readonly ServerRoute[] {
  const files = walkFiles(
    apiSrc,
    (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.d.ts'),
  ).filter((path) => readFileSync(path, 'utf8').includes('@Controller('));
  const routes: ServerRoute[] = [];
  for (const file of files) {
    const source = parse(file);
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      const controller = decoratorCall(statement).find((entry) => entry.name === 'Controller');
      if (controller === undefined) continue;
      const first = controller.args[0];
      const prefixes =
        first === undefined
          ? ['']
          : ts.isArrayLiteralExpression(first)
            ? first.elements.map((element) => stringOf(element) ?? '')
            : [stringOf(first) ?? ''];
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const decorators = decoratorCall(member);
        const http = decorators.find((entry) => HTTP_DECORATORS[entry.name] !== undefined);
        if (http === undefined) continue;
        const action = decorators.find((entry) => entry.name === 'RequiresTransportAction');
        for (const prefix of prefixes) {
          routes.push({
            method: HTTP_DECORATORS[http.name] as HttpMethod,
            segments: toSegments(joinPath(prefix, stringOf(http.args[0]) ?? '')),
            action: action === undefined ? null : stringOf(action.args[0]),
            where: `${relative(apiSrc, file).replace(/\\/g, '/')}#${member.name.getText(source)}`,
          });
        }
      }
    }
  }
  return routes;
}

/**
 * So `@RequiresTransportAction(` trong ma nguon API, dem THO bang chu — doi chung cho bo phan tich
 * cay: moi decorator phai thanh dung mot route co ma (khong lot mot controller viet kieu khac).
 */
export function countActionDecorators(apiSrc: string): number {
  return walkFiles(
    apiSrc,
    (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.d.ts'),
  ).reduce(
    (total, path) =>
      total + (readFileSync(path, 'utf8').match(/@RequiresTransportAction\(/g) ?? []).length,
    0,
  );
}

/**
 * Route may chu cho mot lan goi — cung luat voi bo dinh tuyen: doan chu phai khop dung chu, tham so
 * cua may chu nhan moi doan; khi hai route cung khop (`accounts/link-counts` vs `accounts/:id`), route
 * co nhieu doan CHU hon thang.
 */
export function matchRoute(
  routes: readonly ServerRoute[],
  method: HttpMethod,
  segments: readonly string[],
): ServerRoute | null {
  let best: { readonly route: ServerRoute; readonly literal: number } | null = null;
  for (const route of routes) {
    if (route.method !== method || route.segments.length !== segments.length) continue;
    let literal = 0;
    let fits = true;
    route.segments.forEach((segment, index) => {
      const wanted = segments[index];
      if (segment === PARAM) return;
      if (segment === wanted) literal += 1;
      else fits = false;
    });
    if (fits && (best === null || literal > best.literal)) best = { route, literal };
  }
  return best?.route ?? null;
}

/* ------------------------------------------------------------------ *
 * 2. Ham client
 * ------------------------------------------------------------------ */

export interface ClientCall {
  /** Ten day du, vd `transportApi.fleet.vehicles`. */
  readonly name: string;
  readonly method: HttpMethod;
  readonly segments: readonly string[];
}

const GET_HELPERS = new Set(['get', 'getList']);

/** `${encodeURIComponent(id)}` giua duong dan → `:`; `${toQuery(...)}`, `?…` → cat bo (query). */
function pathOfExpression(expression: ts.Expression): string | null {
  // `status === undefined ? '/x' : `/x?status=…`` — hai nhanh chi khac o query.
  if (ts.isConditionalExpression(expression)) {
    return pathOfExpression(expression.whenTrue) ?? pathOfExpression(expression.whenFalse);
  }
  const literal = stringOf(expression);
  if (literal !== null) return literal.split('?')[0] ?? '';
  if (!ts.isTemplateExpression(expression)) return null;
  let text = expression.head.text;
  for (const span of expression.templateSpans) {
    if (text.includes('?')) break;
    text += text.endsWith('/') ? PARAM : '?';
    text += span.literal.text;
  }
  return text.split('?')[0] ?? '';
}

function httpCallOf(node: ts.Node): { method: HttpMethod; path: string } | null {
  let found: { method: HttpMethod; path: string } | null = null;
  const visit = (child: ts.Node): void => {
    if (found !== null) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      const callee = child.expression.text;
      const [first, second] = child.arguments;
      if (GET_HELPERS.has(callee) && first !== undefined) {
        const path = pathOfExpression(first);
        if (path !== null && path.startsWith('/')) found = { method: 'GET', path };
      } else if (callee === 'send' && first !== undefined && second !== undefined) {
        const method = stringOf(first);
        const path = pathOfExpression(second);
        if (method !== null && path !== null) found = { method: method as HttpMethod, path };
      } else if (callee === 'remove' && first !== undefined) {
        const path = pathOfExpression(first);
        if (path !== null) found = { method: 'DELETE', path };
      } else if (callee === 'sendForm' && first !== undefined) {
        const path = pathOfExpression(first);
        if (path !== null) found = { method: 'POST', path };
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** Bo lop `as const` / `satisfies` / ngoac quanh mot bieu thuc. */
const unwrap = (expression: ts.Expression): ts.Expression =>
  ts.isAsExpression(expression) ||
  ts.isSatisfiesExpression(expression) ||
  ts.isParenthesizedExpression(expression)
    ? unwrap(expression.expression)
    : expression;

/** Moi ham la trong cac doi tuong client xuat ra (`export const transportApi = { ... }`). */
export function readClientCalls(files: readonly string[]): ReadonlyMap<string, ClientCall> {
  const calls = new Map<string, ClientCall>();
  const collect = (prefix: string, object: ts.ObjectLiteralExpression): void => {
    for (const property of object.properties) {
      const key = property.name === undefined ? null : property.name.getText();
      if (key === null) continue;
      const name = `${prefix}.${key}`;
      const body = ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isMethodDeclaration(property)
          ? property
          : null;
      if (body === null) continue;
      if (ts.isObjectLiteralExpression(body)) {
        collect(name, body);
        continue;
      }
      const call = httpCallOf(body);
      if (call !== null) {
        calls.set(name, { name, method: call.method, segments: toSegments(call.path) });
      }
    }
  };
  for (const file of files) {
    for (const statement of parse(file).statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const initializer =
          declaration.initializer === undefined ? undefined : unwrap(declaration.initializer);
        if (
          ts.isIdentifier(declaration.name) &&
          initializer !== undefined &&
          ts.isObjectLiteralExpression(initializer)
        ) {
          collect(declaration.name.text, initializer);
        }
      }
    }
  }
  return calls;
}

/* ------------------------------------------------------------------ *
 * 3 + 4. Query, component, hook — mot do thi
 * ------------------------------------------------------------------ */

const TRANSPORT_ACTION = /^transport\.[a-z_]+(\.[a-z_]+)+$/;

/** Ham HOI QUYEN trong phan VE (khong phai cong `enabled` cua query). */
const ACTION_CHECKS = new Set(['canPerform', 'canPerformAll', 'lacksAction']);

export interface QueryDecl {
  /** `tep#ham` noi `useQuery` duoc goi. */
  readonly owner: string;
  /** Ham client ma `queryFn` goi, vd `transportApi.finance.margin`. */
  readonly calls: readonly string[];
  /** Ma hanh dong van tai xuat hien trong `enabled` (ke ca qua mot bien cuc bo). */
  readonly gates: readonly string[];
}

export interface FunctionNode {
  readonly key: string;
  readonly name: string;
  readonly file: string;
  /** Khoa cac ham (hook/component) ma ham nay goi hoac ve. */
  readonly edges: readonly string[];
  readonly queries: readonly QueryDecl[];
  /** Ma hanh dong ma phan VE hoi (`canPerform(...)`, thuoc tinh `action=`/`actions=`). */
  readonly actionChecks: readonly string[];
  /**
   * Ham client goi NGOAI `useQuery` — doc trong mot lan bam (vd mo hop thoai) hoac ghi
   * (`useMutation`). Spec chia theo phuong thuc: GET la mot lan DOC phai khai quyen nhu query.
   */
  readonly clientRefs: readonly string[];
}

export interface SourceGraph {
  readonly nodes: ReadonlyMap<string, FunctionNode>;
  /** `tep#TenComponent` cua moi `case '<muc>':` trong `SectionBody`. */
  readonly sectionRoots: ReadonlyMap<string, string>;
}

const keyOf = (file: string, name: string): string => `${file.replace(/\\/g, '/')}#${name}`;

const resolveModule = (from: string, specifier: string): string | null => {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** Ham cap cao nhat cua mot tep: `function X` va `const X = (...) => ...`. */
const topLevelFunctions = (source: ts.SourceFile): readonly [string, FunctionLike][] =>
  source.statements.flatMap((statement): [string, FunctionLike][] => {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      return [[statement.name.text, statement]];
    }
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap(
      (declaration): [string, FunctionLike][] =>
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
          ? [[declaration.name.text, declaration.initializer]]
          : [],
    );
  });

const importsOf = (file: string, source: ts.SourceFile): ReadonlyMap<string, string> => {
  const map = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const target = resolveModule(file, statement.moduleSpecifier.text);
    const bindings = statement.importClause?.namedBindings;
    if (target === null || bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      map.set(element.name.text, keyOf(target, (element.propertyName ?? element.name).text));
    }
  }
  return map;
};

/** Ten cua `export default <Ten>` (hoac `export default function <Ten>`) — `null` khi khong co. */
const defaultExportName = (file: string): string | null => {
  for (const statement of parse(file).statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      return statement.expression.text;
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.ExportDefault) ===
        ts.ModifierFlags.ExportDefault
    ) {
      return statement.name.text;
    }
  }
  return null;
};

/**
 * `const X = dynamic(() => import('./Y'), …)` (Next.js) → `<X />` ve component MAC DINH cua `Y`;
 * `dynamic(() => import('./Y').then((module) => module.Z), …)` → ve export TEN `Z` cua `Y`.
 * Thieu mat xich nay thi moi query cua mot component nap dong se lot khoi bai do.
 */
const dynamicImportsOf = (file: string, source: ts.SourceFile): ReadonlyMap<string, string> => {
  const map = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (
        !ts.isIdentifier(declaration.name) ||
        call === undefined ||
        !ts.isCallExpression(call) ||
        !ts.isIdentifier(call.expression) ||
        call.expression.text !== 'dynamic'
      ) {
        continue;
      }
      let specifier: string | null = null;
      let namedExport: string | null = null;
      const find = (child: ts.Node): void => {
        if (
          specifier === null &&
          ts.isCallExpression(child) &&
          child.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
          specifier = stringOf(child.arguments[0]);
        }
        // `.then((module) => module.Z)` — ten export duoc chon; `then` chinh no khong phai ten do.
        if (ts.isPropertyAccessExpression(child) && child.name.text !== 'then') {
          namedExport = child.name.text;
        }
        ts.forEachChild(child, find);
      };
      find(call);
      const target = specifier === null ? null : resolveModule(file, specifier);
      if (target === null) continue;
      map.set(
        declaration.name.text,
        keyOf(target, namedExport ?? defaultExportName(target) ?? declaration.name.text),
      );
    }
  }
  return map;
};

const actionLiterals = (node: ts.Node): string[] => {
  const found: string[] = [];
  const visit = (child: ts.Node): void => {
    const text = stringOf(child);
    if (text !== null && TRANSPORT_ACTION.test(text)) found.push(text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};

/** Bien cuc bo `const x = <bieu thuc>` trong than ham — de doc cong `enabled: x`. */
const localInitializers = (fn: FunctionLike): ReadonlyMap<string, ts.Expression> => {
  const map = new Map<string, ts.Expression>();
  const visit = (child: ts.Node): void => {
    if (
      ts.isVariableDeclaration(child) &&
      ts.isIdentifier(child.name) &&
      child.initializer !== undefined
    ) {
      map.set(child.name.text, child.initializer);
    }
    ts.forEachChild(child, visit);
  };
  if (fn.body !== undefined) visit(fn.body);
  return map;
};

const propertyOf = (object: ts.ObjectLiteralExpression, name: string): ts.Expression | null => {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === name) {
      return property.initializer;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return property.name;
    }
  }
  return null;
};

function queryOf(
  owner: string,
  call: ts.CallExpression,
  locals: ReadonlyMap<string, ts.Expression>,
  clientNames: ReadonlySet<string>,
): QueryDecl {
  const options = call.arguments[0];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return { owner, calls: [], gates: [] };
  }
  const calls = new Set<string>();
  const queryFn = propertyOf(options, 'queryFn');
  const visitFn = (child: ts.Node): void => {
    if (ts.isPropertyAccessExpression(child) && clientNames.has(child.getText())) {
      calls.add(child.getText());
    }
    ts.forEachChild(child, visitFn);
  };
  if (queryFn !== null) visitFn(queryFn);

  const gates = new Set<string>();
  const enabled = propertyOf(options, 'enabled');
  const visitGate = (child: ts.Node, depth: number): void => {
    for (const action of actionLiterals(child)) gates.add(action);
    if (depth > 0) {
      const scan = (inner: ts.Node): void => {
        if (ts.isIdentifier(inner)) {
          const initializer = locals.get(inner.text);
          if (initializer !== undefined) visitGate(initializer, depth - 1);
        }
        ts.forEachChild(inner, scan);
      };
      scan(child);
    }
  };
  if (enabled !== null) visitGate(enabled, 2);
  return { owner, calls: [...calls], gates: [...gates] };
}

export function readSourceGraph(input: {
  readonly experienceDir: string;
  readonly sectionBodyFile: string;
  readonly clientNames: ReadonlySet<string>;
}): SourceGraph {
  const files = walkFiles(input.experienceDir, (path) => /\.(ts|tsx)$/.test(path));
  const nodes = new Map<string, FunctionNode>();

  for (const file of files) {
    const source = parse(file);
    const imports = new Map([...importsOf(file, source), ...dynamicImportsOf(file, source)]);
    const locals = new Map(topLevelFunctions(source));
    const resolveName = (name: string): string | null =>
      locals.has(name) ? keyOf(file, name) : (imports.get(name) ?? null);

    for (const [name, fn] of locals) {
      const key = keyOf(file, name);
      const edges = new Set<string>();
      const queries: QueryDecl[] = [];
      const checks = new Set<string>();
      const clientRefs = new Set<string>();
      const initializers = localInitializers(fn);
      const insideQuery = new Set<ts.Node>();

      const visit = (child: ts.Node): void => {
        if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
          const callee = child.expression.text;
          if (callee === 'useQuery') {
            queries.push(queryOf(key, child, initializers, input.clientNames));
            insideQuery.add(child);
          } else if (ACTION_CHECKS.has(callee)) {
            for (const action of child.arguments.flatMap(actionLiterals)) checks.add(action);
          } else if (/^use[A-Z]/.test(callee)) {
            const target = resolveName(callee);
            if (target !== null) edges.add(target);
          }
        }
        if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
          const tag = child.tagName;
          if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
            const target = resolveName(tag.text);
            if (target !== null) edges.add(target);
          }
        }
        if (
          ts.isJsxAttribute(child) &&
          ['action', 'actions'].includes(child.name.getText()) &&
          child.initializer !== undefined
        ) {
          for (const action of actionLiterals(child.initializer)) checks.add(action);
        }
        if (ts.isPropertyAccessExpression(child) && input.clientNames.has(child.getText())) {
          clientRefs.add(child.getText());
        }
        if (!insideQuery.has(child)) ts.forEachChild(child, visit);
      };
      if (fn.body !== undefined) visit(fn.body);

      nodes.set(key, {
        key,
        name,
        file: file.replace(/\\/g, '/'),
        edges: [...edges],
        queries,
        actionChecks: [...checks],
        clientRefs: [...clientRefs],
      });
    }
  }

  return { nodes, sectionRoots: sectionRootsOf(input.sectionBodyFile) };
}

/** `case '<muc>': return <View ... />;` trong `SectionBody` → khoa cua component. */
function sectionRootsOf(file: string): ReadonlyMap<string, string> {
  const source = parse(file);
  // Muc co the tro toi mot man NAP DONG (`dynamic(...)`, vd hai man quan tri) — cung la goc cua muc.
  const imports = new Map([...importsOf(file, source), ...dynamicImportsOf(file, source)]);
  const roots = new Map<string, string>();
  const body = topLevelFunctions(source).find(([name]) => name === 'SectionBody')?.[1];
  if (body === undefined) throw new Error('Khong tim thay SectionBody');
  const visit = (child: ts.Node): void => {
    if (ts.isCaseClause(child)) {
      const id = stringOf(child.expression);
      let tag: string | null = null;
      const findTag = (inner: ts.Node): void => {
        if (tag !== null) return;
        if (
          (ts.isJsxOpeningElement(inner) || ts.isJsxSelfClosingElement(inner)) &&
          ts.isIdentifier(inner.tagName)
        ) {
          tag = inner.tagName.text;
        }
        ts.forEachChild(inner, findTag);
      };
      child.statements.forEach(findTag);
      const target = tag === null ? undefined : imports.get(tag);
      if (id !== null && target !== undefined) roots.set(id, target);
    }
    ts.forEachChild(child, visit);
  };
  visit(body);
  return roots;
}

/**
 * Moi ham ve toi duoc tu mot goc — di qua hook va component con, dung o nhung ham trong `stop`
 * (vd `useNavigationInput`: hoi pham vi nguoi xem, khong phai du lieu cua muc).
 */
export function reachableFrom(
  graph: SourceGraph,
  root: string,
  stop: ReadonlySet<string>,
): readonly FunctionNode[] {
  const seen = new Set<string>();
  const order: FunctionNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = graph.nodes.get(key);
    if (node === undefined || stop.has(node.name)) continue;
    order.push(node);
    stack.push(...node.edges);
  }
  return order;
}
