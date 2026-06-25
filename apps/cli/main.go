// Command specpin is the local sidecar for Specpin: it scaffolds and serves a
// repo's .specs/ directory over a hardened localhost HTTP API that the browser
// extension connects to.
package main

import "specpin/cmd"

func main() {
	cmd.Execute()
}
