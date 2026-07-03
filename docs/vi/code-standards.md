# Chuẩn Code

> Bản tiếng Việt của `docs/code-standards.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Các chuẩn được rút ra từ cấu hình tooling thực tế và các convention quan sát được trong monorepo Specpin. Mọi quy tắc đều phản ánh những gì codebase đã thực thi, không phải các hướng dẫn lý tưởng.

## File Naming

**TypeScript/JavaScript**: kebab-case
- `capture-mode.ts`, `sidecar-controller.ts`, `keyboard.ts`
- File test: `*.test.ts`
- File config: lowercase (`biome.json`, `tsconfig.json`)

**Go**: snake_case (convention của Go stdlib)
- `server.go`, `middleware.go`, `hub.go`
- File test: `*_test.go`

**Generated files**: pattern `*.gen.*`
- `schema.gen.ts`, `types.gen.ts`, `validators.gen.cjs`, `validators.gen.d.cts`
- TUYỆT ĐỐI không sửa tay các file này
- Luôn regenerate qua `pnpm --filter @specpin/spec-schema gen`
- Biome bỏ qua chúng (xem các negation `files.includes` trong `biome.json`)
- Git theo dõi chúng (cần thiết cho consumer không có bước build)

**Markdown**: lowercase với dấu gạch ngang
- `system-architecture.md`, `run-guide.md`, `schema-reference.md`

## TypeScript Standards

### Compiler Options (tsconfig.base.json)

```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "lib": ["ES2022", "DOM", "DOM.Iterable"],
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "declaration": true,
  "composite": true,
  "sourceMap": true,
  "esModuleInterop": true,
  "resolveJsonModule": true,
  "isolatedModules": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true
}
```

**Các quy tắc chính:**
- Strict mode BẬT (tất cả các strict check đều được kích hoạt).
- `noUncheckedIndexedAccess`: truy cập array/object trả về `T | undefined`, buộc phải kiểm tra tường minh.
- `noImplicitOverride`: phải dùng từ khóa `override` khi override method của base class.
- Composite project cho workspace reference.
- ESM only (`"type": "module"` trong mọi package.json).

### Biome (biome.json)

Một tool duy nhất xử lý lint, format và import organize. Không có ESLint hay Prettier.

**Linter:** preset `recommended` cộng thêm hai correctness rule chặt chẽ hơn:

```jsonc
"linter": {
  "rules": {
    "preset": "recommended",
    "correctness": {
      "noUnusedVariables": "error",
      "noUnusedImports": "error"
    }
  }
}
```

**Formatter:** khớp với style Prettier trước đây, nên diff khi migrate giữ ở mức nhỏ:

```jsonc
"formatter": {
  "indentStyle": "space",
  "indentWidth": 2,
  "lineWidth": 100
}
```

Quote (double), semicolon (always) và trailing comma (all) dùng giá trị mặc định của Biome, vốn đã
khớp với cấu hình Prettier cũ.

**Override cho JSON trong `.specs/`:** một override ép `json.formatter.expand: "always"` cho `**/.specs/**/*.json`:

```jsonc
"overrides": [
  { "includes": ["**/.specs/**/*.json"], "json": { "formatter": { "expand": "always" } } }
]
```

Go sidecar và `specpin init` ghi file spec bằng `json.MarshalIndent` (mỗi phần tử object/array nằm
trên một dòng riêng). Mặc định `expand: "auto"` của Biome lại giữ các object/array nhỏ ở dạng gọn,
nên khi sửa một element qua sidecar thì cả file bị format lại. `expand: "always"` giúp Biome và các
bộ ghi phía Go tạo ra output giống hệt nhau theo byte, nhờ đó các lần sửa qua sidecar chỉ tạo diff
Git tối thiểu. Các file seed trong `.specs/` được giữ ở dạng expanded này.

Các repo của end-user (không có cấu hình Biome này) đạt kết quả tương tự qua lệnh `specpin format`:
lệnh này viết lại JSON trong `.specs/` về dạng canonical bằng chính bộ marshaling của CLI, còn
`specpin format --check` để gate drift trong CI / pre-commit. Hướng dẫn: coi `.specs/` là artifact
do tool sở hữu và loại trừ nó khỏi formatter chung của repo. Xem tài liệu CLI cho end-user.

**Ignore** (các negation `files.includes`, cộng thêm `.gitignore` qua `vcs.useIgnoreFile`):
- `**/*.gen.*` (tất cả generated file)
- `apps/cli/**` (Go sidecar)
- `packages/spec-schema/schema/**` (schema SSOT)

**Lệnh:**
- `pnpm lint` -> `biome check .` (lint + format check + import organize, chỉ đọc)
- `pnpm lint:fix` -> `biome check --write .` (áp dụng các safe fix)
- `pnpm format` -> `biome format --write .`

**Enforcement**: `biome ci .` trong CI gate cả lint lẫn format. Chạy `pnpm lint` cục bộ trước khi mở PR.

### Package Structure

Tất cả package TS theo cấu trúc này:

```
package/
  src/
    index.ts          # Barrel export (only public API)
    *.ts              # Implementation
    *.test.ts         # Vitest tests
  dist/               # Build output (gitignored except for published packages)
  tsconfig.json       # Extends tsconfig.base.json
  package.json
  vitest.config.ts    # If custom config needed
```

**Yêu cầu với package.json:**
- `"type": "module"` (ESM only)
- `"main": "./dist/index.js"`
- `"types": "./dist/index.d.ts"`
- Trường `"exports"` cho các bundler hiện đại
- `"files": ["dist"]` (hoặc `["dist", "schema"]` cho spec-schema)

**Script (chuẩn dùng chung giữa các package):**
- `build`: `tsc -p tsconfig.json` (hoặc `tsx scripts/gen-types.ts && tsc` cho spec-schema)
- `typecheck`: `tsc -p tsconfig.json --noEmit`
- `test`: `vitest run`

Linting không phải là script theo từng package: Biome chạy một lần từ repo root (`pnpm lint`).

### Testing (Vitest 3)

**Config**: happy-dom cho các DOM test (fingerprint-core), không DOM cho các package khác.

**File naming**: `*.test.ts` đặt cạnh file source.

**Coverage**: theo dõi qua `@vitest/coverage-v8` (fingerprint-core có script `test:coverage`).

**CI gate**: `pnpm test` (turbo run test trên tất cả package).

## Go Standards

### Project Layout

Layout chuẩn của Go (không có thư mục `pkg/`):

```
apps/cli/
  cmd/              # Command implementations (cobra)
    root.go
    init.go
    serve.go
    generate.go
  internal/         # Private packages
    schema/
    server/
    store/
    watch/
  bin/              # Build output (gitignored)
  Makefile
  go.mod
  go.sum
```

**Quy tắc `internal/`**: code trong `internal/` không thể được import bởi module bên ngoài (Go thực thi).

### Coding Conventions

**Error handling:**
```go
if err != nil {
    return fmt.Errorf("context: %w", err)
}
```
Luôn wrap error kèm context bằng `%w` (có thể unwrap).

**Không có global mutable state**: server giữ toàn bộ state, truyền qua struct field hoặc function param.

**Schema embedding:**
```go
//go:embed v1.json
var schemaData []byte
```
Schema được load tại compile time, không bao giờ đọc từ disk tại runtime.

**Build flag:**
```makefile
CGO_ENABLED=0 go build -o $(BIN) .
```
Chỉ build static binary (không có C dependency).

### Testing

**Framework**: package `testing` của stdlib.

**File naming**: `*_test.go` (convention của Go).

**Table-driven test** được ưu tiên:
```go
func TestFoo(t *testing.T) {
    tests := []struct {
        name string
        input string
        want string
    }{
        {"case1", "input1", "output1"},
        {"case2", "input2", "output2"},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := Foo(tt.input)
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

**CI gate**: `go vet ./...`, `go test ./...`, `make build`.

### Makefile Standards

Tất cả project Go dùng Makefile để điều phối build (không dùng go:generate).

**Target chuẩn:**
- `build`: build binary (phụ thuộc vào mọi bước codegen)
- `test`: `go test ./...`
- `vet`: `go vet ./...`
- `clean`: xóa các build artifact

**Riêng cho CLI (apps/cli/Makefile):**
- `sync-schema`: copy `packages/spec-schema/schema/v1.json` sang `internal/schema/v1.json`
- `check-schema`: diff bản canonical với bản embedded, fail nếu lệch (CI gate)
- `build`: phụ thuộc vào `sync-schema`

## Schema Management (Critical Invariant)

**One schema, two validators**:

1. **Canonical source**: `packages/spec-schema/schema/v1.json` (130+ dòng, sửa tay). Định nghĩa `Spec`, `SpecManifest`, `SpecFile`, `ViewsConfig`.
2. **TS validator**: ajv standalone trong `packages/spec-schema/src/*.gen.*` (generate qua `pnpm gen`). Expose `validateSpec`, `validateManifest`, `validateSpecFile`, `validateViews`.
3. **Go validator**: `santhosh-tekuri/jsonschema/v6` trên bản embedded copy tại `apps/cli/internal/schema/v1.json` (sync qua `make sync-schema`). Expose `ValidateSpec`, `ValidateManifest`, `ValidateSpecFile`, `ValidateViews`.

**Quy trình khi thay đổi schema:**
```bash
# 1. Edit canonical schema
vim packages/spec-schema/schema/v1.json

# 2. Regenerate TS types + validators
pnpm --filter @specpin/spec-schema gen

# 3. Sync to Go CLI
cd apps/cli
make sync-schema

# 4. Verify no drift
make check-schema

# 5. Update fixtures (specs + views) so both validators agree
# Add/edit files in tests/fixtures/specs/{valid,invalid} and tests/fixtures/views/{valid,invalid}

# 6. Run full test suite
cd ../..
pnpm test
cd apps/cli
go test ./...
```

**CI enforcement:**
- Job JS: `turbo run schema-validate` (cross-validate fixture cho spec + view qua ajv).
- Job Go: `make check-schema` (fail nếu bản embedded copy lệch).

**Tuyệt đối không sửa tay:**
- `packages/spec-schema/src/*.gen.*` (TS generated)
- `apps/cli/internal/schema/v1.json` (bản embedded copy của Go)

## Git Commit Standards

**Format**: Conventional Commits (thực thi bởi review, không phải git hook).

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`.

**Scope**: tên package hoặc app (`spec-schema`, `fingerprint-core`, `cli`, `extension`).

**Ví dụ:**
```
feat(extension): add sidebar renderer
fix(cli): prevent path traversal in spec writes
docs: add codebase summary
chore(deps): bump wxt to 0.20
```

**Tuyệt đối không commit:**
- Secret, token, API key, file `.env`.
- Dữ liệu cá nhân, credential, database dump.
- Binary lớn (trừ các asset thiết yếu).

## PR & CI Gates

**Trước khi mở PR:**
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm schema-validate` (root)
2. `cd apps/cli && make check-schema && go vet ./... && go test ./... && make build`

**CI phải pass:**
- Lint + format (`biome ci .`)
- Tất cả typecheck (tsc --noEmit theo từng package)
- Tất cả test (Vitest TS, Go stdlib testing)
- Tất cả build (turbo build + make build CLI)
- Schema cross-validation (ajv + Go validator đồng thuận trên fixture)
- Schema drift check (bản embedded copy khớp với bản canonical)

**CI config**: `.github/workflows/ci.yml` (hai job: JS, Go).

## Code Review Checklist

**Cho mọi thay đổi:**
- [ ] Lint + typecheck + test pass cục bộ trước khi push.
- [ ] Không còn `console.log` hay debug statement.
- [ ] Có error handling (không có silent failure).
- [ ] Thay đổi public API được document (JSDoc hoặc inline comment).

**Cho thay đổi schema:**
- [ ] Đã sửa canonical schema (`packages/spec-schema/schema/v1.json`).
- [ ] Đã regenerate TS type (`pnpm --filter @specpin/spec-schema gen`).
- [ ] Đã sync Go schema (`cd apps/cli && make sync-schema`).
- [ ] Fixture được cập nhật để cover các field mới (spec trong `tests/fixtures/specs/`, view trong `tests/fixtures/views/`).
- [ ] Cả hai validator đều pass fixture (`pnpm schema-validate` và `go test ./...`).

**Cho thay đổi extension:**
- [ ] Giữ Shadow DOM isolation (không rò rỉ style của host page).
- [ ] Message passing được type qua `messaging.ts`.
- [ ] Config mutation bị từ chối trừ khi đến từ extension page.
- [ ] Đã kiểm tra bundle size của content script (target < 500 KB).

**Cho thay đổi CLI:**
- [ ] Error được wrap kèm context (`fmt.Errorf("%w", err)`).
- [ ] Không thêm global mutable state.
- [ ] Giữ path-traversal guard trên các file write.
- [ ] Có token auth + CORS check trên các endpoint mới.

## Security Standards

**Sidecar (apps/cli):**
- Chỉ bind 127.0.0.1 (không bao giờ 0.0.0.0).
- Token auth trên TẤT CẢ request (không có public endpoint).
- CORS giới hạn ở extension origin (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`). Từ chối web origin.
- Path-traversal guard trên các write (giới hạn trong thư mục `.specs/`).
- Không truy cập network bên ngoài (chỉ localhost).

**Extension:**
- Shadow DOM cho tất cả UI được inject (style isolation).
- Config mutation bị từ chối trừ khi đến từ extension page (popup/options).
- Không `eval()`, không inline script (tuân thủ CSP).
- Framework-generated ID được escape trước khi chèn vào DOM.

**Chung:**
- Không có secret trong source code hoặc file config.
- Input validation tại mọi boundary (HTTP body, user form, file path).
- Các thao tác nhạy cảm (write, delete) cần hành động tường minh của người dùng (không auto-save khi chưa xác nhận).

## Performance Standards

**Content script của extension:**
- Target bundle size: < 500 KB chưa nén (MVP: ~450 KB với ajv validator).
- Fingerprint match: < 50ms cho mỗi element (MVP: < 10ms cho exact anchor).
- Render latency: < 100ms sau khi match.

**Sidecar:**
- Startup time: < 1s (auto-pick port, bind, start HTTP).
- SSE latency: < 200ms từ khi file thay đổi tới khi client được thông báo.
- Spec write: atomic (temp + rename), < 100ms cho spec điển hình (~2 KB JSON).

**Build time (full clean build):**
- TS workspace: < 30s (`pnpm build`).
- Go CLI: < 5s (`make build`).
- Extension: < 20s (`pnpm --filter @specpin/extension build`).

## Documentation Standards

**Inline comment:**
- JSDoc cho public API (function, class, interface export từ `index.ts`).
- Inline comment chỉ cho logic phức tạp (ưu tiên code tự diễn giải).
- TODO kèm số issue: `// TODO(#42): refactor this when X is done`.

**Markdown docs:**
- Giữ dưới 800 dòng cho mỗi file (tách thành subdirectory nếu cần).
- Cross-reference các doc liên quan qua relative link (`[run guide](./run-guide.md)`).
- Chỉ dùng dấu câu ASCII (không em dash, en dash, horizontal bar theo quy tắc writing style trong CLAUDE.md).
- Code block kèm language tag (```typescript, ```bash, ```go).

**API documentation:**
- `docs/schema-reference.md` cho định dạng spec (JSON Schema).
- JSDoc trong source cho các TS API (export từ package).
- Inline comment trong Go cho HTTP contract (các handler trong server.go).

## Dependency Management

**Node/pnpm:**
- `pnpm-lock.yaml` được commit (lock build có thể tái lập).
- Workspace protocol cho internal dep (`"workspace:*"`).
- Trường `engines` được thực thi (`node >= 22`).
- `onlyBuiltDependencies: ["esbuild"]` để bỏ qua các native build không cần thiết.

**Go:**
- `go.sum` được commit.
- Dep tối thiểu: chỉ `cobra`, `gorilla/*`, `jsonschema`, `fsnotify`.
- Không có indirect dep nếu không có lý do chính đáng.

**Upgrade:**
- Test trước khi upgrade (đặc biệt với các breaking change).
- Cập nhật lockfile qua `pnpm install` hoặc `go get -u`.
- CI phải pass trước khi merge PR upgrade.

## Browser Compatibility

**Extension:**
- Chrome 120+ (cần MV3).
- Firefox 115+ (MV2 compat mode qua WXT).
- Safari hoãn sang 1.1.

**Content script (fingerprint-core):**
- Pure DOM API (không coupling với framework).
- Target ES2022 (hỗ trợ native trên Chrome 120+, Firefox 115+).
- Không hỗ trợ IE11, không legacy polyfill.

**Môi trường đã test:**
- Chrome 120+ trên Linux, macOS, Windows.
- Firefox 115+ trên Linux, macOS, Windows.
- React 18+, Vue 3+, Angular 15+, Svelte 4+ (heuristic phát hiện framework).

## Unresolved Conventions (Deferred)

- **Tuning hybrid fingerprint scorer**: WEIGHTS table trong `packages/fingerprint-core/src/score.ts` là điểm tuning duy nhất (signal weight, threshold). v1 scorer đã ship và hoạt động, nhưng weight cần tuning dogfood từ dữ liệu production refactor.
- **Định dạng prompt cho AI-assisted capture**: không có LLM integration trong MVP, hoãn sang 1.1.
- **Yêu cầu đóng gói cho Safari**: chờ Apple làm rõ về MV3 parity.

## References

- Biome config (lint + format): `biome.json`
- TypeScript config: `tsconfig.base.json`, `packages/*/tsconfig.json`
- Go build: `apps/cli/Makefile`
- CI workflow: `.github/workflows/ci.yml`
- Architecture: `docs/system-architecture.md`
- Codebase summary: `docs/codebase-summary.md`
