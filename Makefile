VERSION ?= v0.1.0
RELEASE_NOTES ?= Release $(VERSION)

.PHONY: dev-control-plane docker-build release-tag release github-release

dev-control-plane:
	K8S_APPLY_MODE=live KUBECONFIG=/Users/sargampoudel/.kube/config LOCAL_ACCESS_PORT_BASE=3100 pnpm --filter k8s-orchestrator-api --filter provision-web dev

docker-build:
	docker compose build

release-tag:
	git tag $(VERSION)
	git push origin $(VERSION)

github-release:
	gh release create $(VERSION) --title "$(VERSION)" --notes "$(RELEASE_NOTES)"

release: release-tag github-release
