// Minimal demo backend for the closure-ui examples.
//
// It serves the examples directory statically and exposes a couple of JSON
// endpoints so the `grid-dynamic.html` demo can exercise the data grid's
// dynamic mode (server-side pagination + filtering), which a file:// page
// cannot do because it has no backend to fetch from.
//
//	cd examples/server
//	go run .
//	# open http://localhost:8099/grid-dynamic.html
package main

import (
	"encoding/json"
	"flag"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const addr = "localhost:8099"

// person is one row of the demo dataset.
type person struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	City   string `json:"city"`
	Role   string `json:"role"`
	Active bool   `json:"active"`
}

// Pools the generator draws from; the select filters in the demo use the same
// city / role values.
var (
	cities    = []string{"Madrid", "Sevilla", "Valencia", "Bilbao", "Zaragoza"}
	roles     = []string{"Analyst", "Developer", "Designer", "Manager", "Support"}
	firstName = []string{"Ana", "Luis", "Marta", "Jorge", "Lucía", "Pablo", "Elena", "Raúl", "Sara", "Iván", "Nuria", "Óscar", "Clara", "Hugo", "Eva", "Mario", "Rosa", "Aitor", "Inés", "Tomás"}
	lastName  = []string{"Torres", "Pérez", "Gil", "Ruiz", "Mora", "Sanz", "Díaz", "Vega", "León", "Cano", "Paz", "Rey", "Soto", "Marín", "Bravo", "Vidal", "Roca", "Gómez", "Lara", "Mateo"}
)

// people is loaded once at startup from data/people.json.
var people []person

// genPeople builds n random rows in memory (nothing is written to disk). It
// uses a fixed seed so the dataset is reproducible across runs. This is how the
// demo serves a large dataset on demand (`-rows N`) without committing a huge
// file: data/people.json stays a small, readable example of the wire shape.
func genPeople(n int) []person {
	rng := rand.New(rand.NewSource(1))
	pick := func(s []string) string { return s[rng.Intn(len(s))] }
	out := make([]person, n)
	for i := range n {
		out[i] = person{
			ID:     i + 1,
			Name:   pick(firstName) + " " + pick(lastName),
			City:   pick(cities),
			Role:   pick(roles),
			Active: rng.Intn(2) == 0,
		}
	}
	return out
}

// loadPeople reads the demo dataset from <base>/data/people.json. Editing that
// file is all it takes to change what the demo serves — no recompile of the data.
func loadPeople() []person {
	f := filepath.Join(baseDir(), "data", "people.json")
	raw, err := os.ReadFile(f)
	if err != nil {
		log.Fatalf("reading %s: %v", f, err)
	}
	var out []person
	if err := json.Unmarshal(raw, &out); err != nil {
		log.Fatalf("parsing %s: %v", f, err)
	}
	return out
}

// peopleHandler implements the data grid's dynamic-mode contract: it reads the
// grid's offset/limit (form-encoded) plus optional filter params, and returns
// one page wrapped as { data:[...], result:{ total, offset, eof } }.
func peopleHandler(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	// Filters (wired from <filter-field> via <query-param bind="filter.X">).
	q := strings.ToLower(strings.TrimSpace(r.FormValue("q")))
	city := r.FormValue("city")
	role := r.FormValue("role")

	filtered := make([]person, 0, len(people))
	for _, p := range people {
		if q != "" && !strings.Contains(strings.ToLower(p.Name), q) {
			continue
		}
		if city != "" && p.City != city {
			continue
		}
		if role != "" && p.Role != role {
			continue
		}
		filtered = append(filtered, p)
	}

	offset := atoi(r.FormValue("offset"))
	limit := atoi(r.FormValue("limit"))
	if limit <= 0 {
		limit = 10
	}

	total := len(filtered)
	start := clamp(offset, 0, total)
	end := clamp(offset+limit, 0, total)
	page := filtered[start:end]

	writeJSON(w, map[string]any{
		"data": page,
		"result": map[string]any{
			"total":  total,
			"offset": start,
			"eof":    end >= total,
		},
	})
}

func main() {
	rows := flag.Int("rows", 0, "serve N random rows in memory instead of data/people.json (e.g. -rows 50000)")
	flag.Parse()
	if *rows > 0 {
		people = genPeople(*rows)
		log.Printf("serving %d generated random rows", *rows)
	} else {
		people = loadPeople()
	}
	root := baseDir()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/people", peopleHandler)
	mux.Handle("/", staticHandler(root))

	log.Printf("closure-ui examples on http://%s  (serving %s)", addr, root)
	log.Printf("dynamic-grid demo: http://%s/grid-dynamic.html", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// staticHandler serves files from exactly one directory (root), and nothing
// else:
//   - "/" serves index.html (the default document);
//   - any directory request 404s — no directory listings are exposed;
//   - ".." / absolute / escaping paths are rejected before touching disk, and
//     the resolved path is re-checked to stay confined under root.
func staticHandler(root string) http.Handler {
	root = filepath.Clean(root)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upath := r.URL.Path
		if upath == "/" {
			upath = "/index.html"
		}
		// Reject anything with a parent-dir segment or NUL before we resolve it.
		if strings.Contains(upath, "..") || strings.ContainsRune(upath, 0) {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		full := filepath.Join(root, filepath.FromSlash(path.Clean("/"+upath)))
		// Defense in depth: the resolved path must stay under root.
		if full != root && !strings.HasPrefix(full, root+string(os.PathSeparator)) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			http.NotFound(w, r) // missing file or a directory → no listing
			return
		}
		http.ServeFile(w, r, full)
	})
}

// baseDir is the examples/ directory — it holds the html pages, the data/
// folder and (once built) the exe itself. Resolved so the server works both as
// a built exe dropped into examples/ and via `go run .` from examples/server/.
func baseDir() string {
	// Built exe living in examples/ (next to the html + data/): use its dir.
	if exe, err := os.Executable(); err == nil {
		d := filepath.Dir(exe)
		if _, err := os.Stat(filepath.Join(d, "data", "people.json")); err == nil {
			return d
		}
	}
	// `go run` builds a temp exe elsewhere; fall back to this source's parent
	// (server/ -> examples/).
	if _, self, _, ok := runtime.Caller(0); ok {
		return filepath.Dir(filepath.Dir(self))
	}
	return "."
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func atoi(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
