VERSION ?= v0.1.0
RELEASE_NOTES ?= Release $(VERSION)

.PHONY: docker-build release-tag release github-release

docker-build:
	docker compose build

release-tag:
	git tag $(VERSION)
	git push origin $(VERSION)

github-release:
	gh release create $(VERSION) --title "$(VERSION)" --notes "$(RELEASE_NOTES)"

release: release-tag github-release
