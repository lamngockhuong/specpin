// Package schema embeds the canonical Specpin JSON Schema (v1.json) and exposes
// validators for the SpecFile root, individual specs, and the manifest. The
// embedded v1.json is a synced copy of packages/spec-schema/schema/v1.json; CI
// fails if the two drift (see Phase 8).
package schema

import (
	"bytes"
	_ "embed"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed v1.json
var V1JSON []byte

const schemaID = "https://specpin.dev/schema/v1.json"

// Validator holds the compiled schemas for the three validation entry points.
type Validator struct {
	spec     *jsonschema.Schema
	manifest *jsonschema.Schema
	specFile *jsonschema.Schema
}

// NewValidator compiles the embedded schema. Format assertions are enabled so
// the Go validator agrees with ajv+ajv-formats on the TS side (e.g. date-time).
func NewValidator() (*Validator, error) {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(V1JSON))
	if err != nil {
		return nil, fmt.Errorf("parse embedded schema: %w", err)
	}

	c := jsonschema.NewCompiler()
	c.AssertFormat()
	if err := c.AddResource(schemaID, doc); err != nil {
		return nil, fmt.Errorf("add schema resource: %w", err)
	}

	specFile, err := c.Compile(schemaID)
	if err != nil {
		return nil, fmt.Errorf("compile SpecFile schema: %w", err)
	}
	spec, err := c.Compile(schemaID + "#/$defs/Spec")
	if err != nil {
		return nil, fmt.Errorf("compile Spec schema: %w", err)
	}
	manifest, err := c.Compile(schemaID + "#/$defs/Manifest")
	if err != nil {
		return nil, fmt.Errorf("compile Manifest schema: %w", err)
	}

	return &Validator{spec: spec, manifest: manifest, specFile: specFile}, nil
}

func validate(sch *jsonschema.Schema, raw []byte) []string {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return []string{fmt.Sprintf("(root) invalid JSON: %v", err)}
	}
	if err := sch.Validate(doc); err != nil {
		if ve, ok := err.(*jsonschema.ValidationError); ok {
			return flatten(ve)
		}
		return []string{err.Error()}
	}
	return nil
}

// flatten turns a ValidationError into a list of "path message" strings via the
// basic output format, comparable to the ajv error list on the TS side.
func flatten(ve *jsonschema.ValidationError) []string {
	var out []string
	var walk func(u jsonschema.OutputUnit)
	walk = func(u jsonschema.OutputUnit) {
		if u.Error != nil {
			loc := u.InstanceLocation
			if loc == "" {
				loc = "(root)"
			}
			out = append(out, fmt.Sprintf("%s %s", loc, u.Error.String()))
		}
		for _, c := range u.Errors {
			walk(c)
		}
	}
	walk(*ve.BasicOutput())
	if len(out) == 0 {
		out = append(out, ve.Error())
	}
	return out
}

// ValidateSpec validates a single Spec object. Returns nil when valid.
func (v *Validator) ValidateSpec(raw []byte) []string { return validate(v.spec, raw) }

// ValidateManifest validates a manifest.json document.
func (v *Validator) ValidateManifest(raw []byte) []string { return validate(v.manifest, raw) }

// ValidateSpecFile validates a whole <area>.spec.json file.
func (v *Validator) ValidateSpecFile(raw []byte) []string { return validate(v.specFile, raw) }
