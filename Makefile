PYTHON ?= python3
IMG_DIR ?= assets/img

.PHONY: help resize-images resize-images-force update-submodules update-submodules-commit

help:
	@echo "Available targets:"
	@echo "  make resize-images             # Generate/update responsive image variants under assets/img"
	@echo "  make resize-images-force       # Regenerate all responsive image variants"
	@echo "  make update-submodules         # Update icon submodules to latest release tags and stage them"
	@echo "  make update-submodules-commit  # Update icon submodules and create a commit if needed"

resize-images:
	$(PYTHON) scripts/image-resize.py --path $(IMG_DIR)

resize-images-force:
	$(PYTHON) scripts/image-resize.py --path $(IMG_DIR) --force

update-submodules:
	./scripts/update-icon-submodules.sh

update-submodules-commit: update-submodules
	@if git diff --cached --quiet -- assets/css/vendor/fontawesome assets/css/vendor/academicons; then \
		echo "No submodule updates to commit."; \
	else \
		fa_tag="$$(git -C assets/css/vendor/fontawesome describe --tags --exact-match)"; \
		ac_tag="$$(git -C assets/css/vendor/academicons describe --tags --exact-match)"; \
		git commit -m "chore: update icon submodules (fontawesome $$fa_tag, academicons $$ac_tag)"; \
	fi
