package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/ot4go/miniskin"
	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/js"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Join(filepath.Dir(file), "..")
	if err := os.Chdir(root); err != nil {
		return fmt.Errorf("chdir to project root: %w", err)
	}

	if err := os.MkdirAll("src/generated", 0o755); err != nil {
		return err
	}
	if err := miniskin.MiniskinRun("./src", "."); err != nil {
		return fmt.Errorf("miniskin: %w", err)
	}
	if err := copyFile("src/generated/closure-ui.md", "release/closure-ui.md"); err != nil {
		return err
	}
	// doc/ is the git-tracked copy of the generated documentation
	if err := copyFile("src/generated/closure-ui.md", "doc/closure-ui.md"); err != nil {
		return err
	}
	// examples/ pages load the bundle locally so they work from a fresh
	// clone (release/ is gitignored)
	if err := copyFile("src/generated/closure-ui.js", "examples/closure-ui.js"); err != nil {
		return err
	}
	if err := copyFile("src/generated/closure-ui.js", "release/closure-ui.js"); err != nil {
		return err
	}
	if err := minifyJS("release/closure-ui.js", "release/closure-ui.min.js"); err != nil {
		return err
	}
	// Versioned artifacts are only born where their tag is about to be
	// created: the release workflow passes `release`. Every other build —
	// local, PR check — still VALIDATES the manifest (a broken one must
	// fail the PR, not the release) but emits nothing versioned, and cleans
	// stale packaging leftovers so release/ stays deterministic.
	if len(os.Args) > 1 && os.Args[1] == "release" {
		return packageRelease()
	}
	if _, err := readManifest(".build/next-release.json"); err != nil {
		return err
	}
	return cleanReleasePackaging()
}

// packageRelease builds the release-only artifacts, driven by the manifest
// (.build/next-release.json): every base artifact gets a versioned twin
// with the tag glued into the name (distinct, self-describing,
// cacheable-forever URLs), plus verifiable sha256 checksums and a small
// human-readable info txt.
func packageRelease() error {
	man, err := readManifest(".build/next-release.json")
	if err != nil {
		return err
	}
	// Versioned artifacts are only legitimate for a tag that EXISTS: the
	// release workflow creates it right before this build (and deletes it
	// again if anything downstream fails), and a local rehearsal without
	// the tag fails here instead of minting impostor files.
	if err := exec.Command("git", "rev-parse", "-q", "--verify", "refs/tags/"+man.Tag).Run(); err != nil {
		return fmt.Errorf("release packaging: tag %q does not exist", man.Tag)
	}
	pairs := [][2]string{
		{"release/closure-ui.js", "release/closure-ui-" + man.Tag + ".js"},
		{"release/closure-ui.min.js", "release/closure-ui-min-" + man.Tag + ".js"},
		{"release/closure-ui.md", "release/closure-ui-" + man.Tag + ".md"},
	}
	var files []string
	for _, p := range pairs {
		if err := copyFile(p[0], p[1]); err != nil {
			return err
		}
		files = append(files, p[0], p[1])
	}
	// sha256sum-compatible: `sha256sum -c checksums.txt` / Get-FileHash
	if err := writeChecksums("release/checksums.txt", files); err != nil {
		return err
	}
	return writeReleaseInfo("release/release-info.txt", man, files)
}

func cleanReleasePackaging() error {
	var stale []string
	for _, pattern := range []string{
		"release/closure-ui-v*.js",
		"release/closure-ui-min-v*.js",
		"release/closure-ui-v*.md",
	} {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			return err
		}
		stale = append(stale, matches...)
	}
	stale = append(stale, "release/checksums.txt", "release/release-info.txt")
	for _, f := range stale {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

type manifest struct {
	Tag   string `json:"tag"`
	Title string `json:"title"`
}

// readManifest loads the release manifest. The manifest is a required repo
// file: missing or invalid, the build fails — in every mode.
func readManifest(path string) (*manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("release manifest: %w", err)
	}
	var man manifest
	if err := json.Unmarshal(data, &man); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if !regexp.MustCompile(`^v\d+\.\d+\.\d+$`).MatchString(man.Tag) {
		return nil, fmt.Errorf("%s: tag %q is not vMAJOR.MINOR.PATCH", path, man.Tag)
	}
	return &man, nil
}

func fileSha256(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func writeChecksums(dst string, files []string) error {
	var b strings.Builder
	for _, f := range files {
		sum, err := fileSha256(f)
		if err != nil {
			return err
		}
		fmt.Fprintf(&b, "%s  %s\n", sum, filepath.Base(f))
	}
	return os.WriteFile(dst, []byte(b.String()), 0o644)
}

// writeReleaseInfo emits the small "everything about this release" txt:
// tag, title, links (when the GitHub env is present — i.e. in CI), build
// time and the per-file sha256 list.
func writeReleaseInfo(dst string, man *manifest, files []string) error {
	var b strings.Builder
	fmt.Fprintf(&b, "closure-ui %s — %s\n\n", man.Tag, man.Title)
	if repo := os.Getenv("GITHUB_REPOSITORY"); repo != "" {
		server := os.Getenv("GITHUB_SERVER_URL")
		if server == "" {
			server = "https://github.com"
		}
		fmt.Fprintf(&b, "release:  %s/%s/releases/tag/%s\n", server, repo, man.Tag)
		fmt.Fprintf(&b, "latest:   %s/%s/releases/latest\n", server, repo)
		fmt.Fprintf(&b, "download: %s/%s/releases/download/%s/<file>\n", server, repo, man.Tag)
	}
	fmt.Fprintf(&b, "built:    %s\n\nfiles (sha256):\n", time.Now().UTC().Format(time.RFC3339))
	for _, f := range files {
		sum, err := fileSha256(f)
		if err != nil {
			return err
		}
		fmt.Fprintf(&b, "  %s  %s\n", sum, filepath.Base(f))
	}
	return os.WriteFile(dst, []byte(b.String()), 0o644)
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func minifyJS(src, dst string) error {
	m := minify.New()
	m.Add("application/javascript", &js.Minifier{KeepVarNames: true})

	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	return m.Minify("application/javascript", out, in)
}
