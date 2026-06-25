# Specpin sidecar CLI. The embedded JSON Schema is synced from the canonical
# source in packages/spec-schema; never hand-edit internal/schema/v1.json.

SCHEMA_SRC := ../../packages/spec-schema/schema/v1.json
SCHEMA_DST := internal/schema/v1.json
BIN        := bin/specpin

.PHONY: sync-schema check-schema build test vet clean

# Copy the canonical schema into the embed location.
sync-schema:
	cp $(SCHEMA_SRC) $(SCHEMA_DST)

# Fail if the embedded schema has drifted from the canonical source (CI gate).
check-schema:
	@diff -q $(SCHEMA_SRC) $(SCHEMA_DST) >/dev/null \
		&& echo "embedded schema in sync" \
		|| { echo "ERROR: embedded schema drifted from $(SCHEMA_SRC); run 'make sync-schema'"; exit 1; }

build: sync-schema
	CGO_ENABLED=0 go build -o $(BIN) .

test:
	go test ./...

vet:
	go vet ./...

clean:
	rm -rf bin
