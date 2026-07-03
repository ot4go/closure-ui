// Action: release — the canonical release build (release.yml). Runs the
// full build and then the release packaging: versioned twins of every
// artifact, checksums.txt and release-info.txt. Requires the manifest's tag
// to already exist (the workflow creates it right before calling this).
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
	return core.PackageRelease()
}
