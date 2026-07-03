// Action: build — the everyday build (build.bat locally, build.yml in CI).
// Produces the stable artifacts only; validates the release manifest (a
// broken one must fail the PR check, not the release) and cleans any stale
// packaging leftovers. No versioned files are ever emitted here.
package main

import (
	"fmt"
	"os"

	"github.com/ot4go/closure-ui/internal/core"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if err := core.ChdirRoot(); err != nil {
		return err
	}
	if err := core.BuildAll(); err != nil {
		return err
	}
	if _, err := core.ReadManifest(core.ManifestPath); err != nil {
		return err
	}
	return core.CleanPackaging()
}
