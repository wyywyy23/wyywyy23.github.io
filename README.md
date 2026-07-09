# Personal Website

My personal website built with [Hydejack](https://hydejack.com/)

## Maintenance Automation

### Responsive Image Variants

Generate or refresh responsive image variants (`@480w`, `@960w`, etc.) for originals under `assets/img`:

```bash
make resize-images
```

Force regeneration of all variants:

```bash
make resize-images-force
```

The script also updates variants when an original image is replaced and removes stale variants that no longer match the source dimensions.

### Icon Submodules

Update both icon submodules to their latest release tags and stage pointer changes:

```bash
make update-submodules
```

Update and commit in one command (if changes exist):

```bash
make update-submodules-commit
```

### GitHub Workflow

The workflow at `.github/workflows/maintenance.yml` can run this automation manually (workflow dispatch) or weekly. When changes are detected, it opens a pull request automatically.
