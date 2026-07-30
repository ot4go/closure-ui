package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestPackageNpmStaging smokes the npm staging against the last build's
// outputs: the folder carries exactly the publishable set and the
// package.json is born from the manifest (version) and mkskill's <meta>
// (description, license). Skipped when no build ran yet.
func TestPackageNpmStaging(t *testing.T) {
	if err := ChdirRoot(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat("release/closure-ui.min.js"); err != nil {
		t.Skip("no build outputs yet — run the build first")
	}
	if err := PackageNpm(&Manifest{Tag: "v9.9.9", Title: "smoke"}); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(filepath.Join("release", "npm"))

	for _, f := range []string{"closure-ui.js", "closure-ui.min.js", "README.md", "LICENSE", "package.json"} {
		if _, err := os.Stat(filepath.Join("release", "npm", f)); err != nil {
			t.Errorf("staging misses %s", f)
		}
	}
	data, err := os.ReadFile(filepath.Join("release", "npm", "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pkg map[string]any
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatalf("package.json is not valid JSON: %v", err)
	}
	if pkg["name"] != "closure-ui" || pkg["version"] != "9.9.9" {
		t.Errorf("name/version wrong: %v / %v", pkg["name"], pkg["version"])
	}
	if pkg["license"] != "MIT" {
		t.Errorf("license should come from mkskill's <meta>: %v", pkg["license"])
	}
	if desc, _ := pkg["description"].(string); len(desc) < 50 {
		t.Errorf("description should be the <meta> one, got %q", desc)
	}
}
