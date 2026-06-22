package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"

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
	return minifyJS("release/closure-ui.js", "release/closure-ui.min.js")
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
