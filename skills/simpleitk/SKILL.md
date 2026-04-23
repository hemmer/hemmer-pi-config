---
name: simpleitk
description: Work with medical images using SimpleITK concepts including physical space, transforms, resampling, and image metadata. Use when processing CT, MRI, or volumetric data, converting between voxel and patient coordinate systems, performing segmentation, registration (aligning images).
license: Apache-2.0
compatibility: Requires Python, SimpleITK, and basic numerical computing libraries (NumPy). Designed for agent-based workflows involving medical imaging.
metadata:
  | version | domain |
  | --- | --- |
  | 1.1 | medical-imaging |
---

# Medical Imaging Skill (SimpleIT---
name: simpleitk
description: Work with medical images using SimpleITK concepts including physical space, transforms, resampling, and image metadata. Use when processing CT, MRI, or volumetric data, converting between voxel and patient coordinate systems, performing segmentation, registration (aligning images).
license: Apache-2.0
compatibility: Requires Python, SimpleITK, and basic numerical computing libraries (NumPy). Designed for agent-based workflows involving medical imaging.
metadata:
  | version | domain |
  | --- | --- |
  | 1.1 | medical-imaging |
---

# Medical Imaging Skill (SimpleITK-Oriented)

## When to Use

Use this skill when:

* Working with CT, MRI, ultrasound, or volumetric datasets
* Performing:
  + Registration (image alignment)
  + Resampling or grid transformations
  + Segmentation or label processing
  + Spatial transformations (rigid, affine, deformable)
* Debugging:
  + Misaligned images
  + Incorrect spacing/orientation
  + Empty resampling outputs
  + Upside-down or mirrored slices when plotting

---

## Core Concept: Images Exist in Physical Space

Medical images are not just arrays. Each image represents a region in **physical (patient) space**.

Each image is defined by:

* Origin: physical position of voxel (0,0,0)
* Spacing: voxel size (e.g., mm)
* Size: number of voxels
* Direction: orientation matrix

These define a mapping from index space → physical space.

---

## Coordinate Systems

| Space | Coordinates | Used for |
|---|---|---|
| Index (voxel) | `(i, j, k)` discrete | iteration, pixel access |
| Physical (patient) | `(x, y, z)` in mm | measurement, registration, alignment |

Always reason in **physical space**. Never compute conversions manually — use `image.TransformIndexToPhysicalPoint` / `TransformPhysicalPointToIndex`.

---

## Resampling

Resampling maps an image into a new grid.

Requires:

1. Input image
2. Output grid
3. Transform
4. Interpolator

### Interpolation Rules

* Linear → intensity images (CT/MRI)
* Nearest neighbor → labels/segmentations
* Set resample background value (i.e. SetDefaultPixelValue) to large negative value -2048 rather than zero to avoid clash with water HU values (CT).

### Common Failure

Empty output → wrong transform direction

Fix:
Use inverse transform

---

## Transforms

Transforms map between coordinate systems.

Types:

* Global:
  + Rigid
  + Affine
* Local:
  + B-spline
  + Displacement field

Transforms are composed in reverse order of application.

---

## Functional vs Object-Oriented Interfaces

### Functional

Use for simple pipelines:

```python
sitk.SmoothingRecursiveGaussian(image, sigma=2.0)
```

### Object-Oriented

Use for control and reuse:

```python
f = sitk.SmoothingRecursiveGaussianImageFilter()
f.SetSigma(2.0)
result = f.Execute(image)
```

Rule:

* Functional → quick tasks
* OO → complex workflows

---

## Plotting Anatomical Views Correctly

`sitk.GetArrayFromImage` reverses axis order (SimpleITK x,y,z → NumPy z,y,x) and matplotlib's row-0-at-top conflicts with Superior-up anatomy, causing upside-down or mirrored slices.

Use this helper before any plotting:

```python
def prepare_np_for_plotting(image: sitk.Image) -> np.ndarray:
    """Returns array shaped (S, P, L) ready for imshow — Superior up, Left on right.
    Slice as: vol[s_idx, :, :] axial | vol[:, p_idx, :] coronal | vol[:, :, l_idx] sagittal."""
    image = sitk.DICOMOrient(image, "LPS")  # ensure x=L, y=P, z=S
    return np.flip(sitk.GetArrayFromImage(image), axis=(0, 2))  # Superior up, Left on right
```

Always pass `aspect` to `imshow` using the image's physical spacing to avoid distortion from anisotropic voxels:

```python
sx, sy, sz = image.GetSpacing()  # L, P, S spacing in mm
axes[0].imshow(vol[s_idx, :, :], cmap="gray", aspect=sy / sx)  # axial
axes[1].imshow(vol[:, p_idx, :], cmap="gray", aspect=sz / sx)  # coronal
axes[2].imshow(vol[:, :, l_idx], cmap="gray", aspect=sz / sy)  # sagittal
```

### Common Mistakes

* Calling `GetArrayFromImage` without reorienting to LPS first → unpredictable axis assignments
* Forgetting to flip → Superior appears at bottom, Left on wrong side
* Omitting `aspect` → distorted anatomy when voxels are anisotropic
* Using `origin='lower'` in matplotlib → re-introduces the vertical flip

---

## Best Practices

* Always inspect `origin`, `spacing`, `direction` on loaded images
* Resample to a common physical space before comparing images
* Use correct interpolator per data type (linear for intensity, nearest neighbour for labels)
* Keep units consistent (mm throughout)
* Reorient to LPS before extracting NumPy arrays for display

---

## Examples

```python
# Convert index to physical point
pt = image.TransformIndexToPhysicalPoint((i, j, k))

# Resample into reference grid
resampled = sitk.Resample(image, reference_image, transform,
                          sitk.sitkLinear, defaultPixelValue=-2048.0)

# Plot all three anatomical views
vol = prepare_np_for_plotting(image)
sx, sy, sz = image.GetSpacing()
fig, axes = plt.subplots(1, 3)
axes[0].imshow(vol[s_idx, :, :], cmap="gray", aspect=sy / sx)  # axial
axes[1].imshow(vol[:, p_idx, :], cmap="gray", aspect=sz / sx)  # coronal
axes[2].imshow(vol[:, :, l_idx], cmap="gray", aspect=sz / sy)  # sagittal
```

## When to Use

Use this skill when:

* Working with CT, MRI, ultrasound, or volumetric datasets
* Performing:
  + Registration (image alignment)
  + Resampling or grid transformations
  + Segmentation or label processing
  + Spatial transformations (rigid, affine, deformable)
* Debugging:
  + Misaligned images
  + Incorrect spacing/orientation
  + Empty resampling outputs
  + Upside-down or mirrored slices when plotting

---

## Core Concept: Images Exist in Physical Space

Medical images are not just arrays. Each image represents a region in **physical (patient) space**.

Each image is defined by:

* Origin: physical position of voxel (0,0,0)
* Spacing: voxel size (e.g., mm)
* Size: number of voxels
* Direction: orientation matrix

These define a mapping from index space → physical space.

---

## Coordinate Systems

| Space | Coordinates | Used for |
|---|---|---|
| Index (voxel) | `(i, j, k)` discrete | iteration, pixel access |
| Physical (patient) | `(x, y, z)` in mm | measurement, registration, alignment |

Always reason in **physical space**. Never compute conversions manually — use `image.TransformIndexToPhysicalPoint` / `TransformPhysicalPointToIndex`.

---

## Resampling

Resampling maps an image into a new grid.

Requires:

1. Input image
2. Output grid
3. Transform
4. Interpolator

### Interpolation Rules

* Linear → intensity images (CT/MRI)
* Nearest neighbor → labels/segmentations
* Set resample background value (i.e. SetDefaultPixelValue) to large negative value -2048 rather than zero to avoid clash with water HU values (CT).

### Common Failure

Empty output → wrong transform direction

Fix:
Use inverse transform

---

## Transforms

Transforms map between coordinate systems.

Types:

* Global:
  + Rigid
  + Affine
* Local:
  + B-spline
  + Displacement field

Transforms are composed in reverse order of application.

---

## Functional vs Object-Oriented Interfaces

### Functional

Use for simple pipelines:

```python
sitk.SmoothingRecursiveGaussian(image, sigma=2.0)
```

### Object-Oriented

Use for control and reuse:

```python
f = sitk.SmoothingRecursiveGaussianImageFilter()
f.SetSigma(2.0)
result = f.Execute(image)
```

Rule:

* Functional → quick tasks
* OO → complex workflows

---

## Plotting Anatomical Views Correctly

`sitk.GetArrayFromImage` reverses axis order (SimpleITK x,y,z → NumPy z,y,x) and matplotlib's row-0-at-top conflicts with Superior-up anatomy, causing upside-down or mirrored slices.

Use this helper before any plotting:

```python
def prepare_np_for_plotting(image: sitk.Image) -> np.ndarray:
    """Returns array shaped (S, P, L) ready for imshow — Superior up, Left on right.
    Slice as: vol[s_idx, :, :] axial | vol[:, p_idx, :] coronal | vol[:, :, l_idx] sagittal."""
    image = sitk.DICOMOrient(image, "LPS")  # ensure x=L, y=P, z=S
    return np.flip(sitk.GetArrayFromImage(image), axis=(0, 2))  # Superior up, Left on right
```

Always pass `aspect` to `imshow` using the image's physical spacing to avoid distortion from anisotropic voxels:

```python
sx, sy, sz = image.GetSpacing()  # L, P, S spacing in mm
axes[0].imshow(vol[s_idx, :, :], cmap="gray", aspect=sy / sx)  # axial
axes[1].imshow(vol[:, p_idx, :], cmap="gray", aspect=sz / sx)  # coronal
axes[2].imshow(vol[:, :, l_idx], cmap="gray", aspect=sz / sy)  # sagittal
```

### Common Mistakes

* Calling `GetArrayFromImage` without reorienting to LPS first → unpredictable axis assignments
* Forgetting to flip → Superior appears at bottom, Left on wrong side
* Omitting `aspect` → distorted anatomy when voxels are anisotropic
* Using `origin='lower'` in matplotlib → re-introduces the vertical flip

---

## Best Practices

* Always inspect `origin`, `spacing`, `direction` on loaded images
* Resample to a common physical space before comparing images
* Use correct interpolator per data type (linear for intensity, nearest neighbour for labels)
* Keep units consistent (mm throughout)
* Reorient to LPS before extracting NumPy arrays for display

---

## Examples

```python
# Convert index to physical point
pt = image.TransformIndexToPhysicalPoint((i, j, k))

# Resample into reference grid
resampled = sitk.Resample(image, reference_image, transform,
                          sitk.sitkLinear, defaultPixelValue=-2048.0)

# Plot all three anatomical views
vol = prepare_np_for_plotting(image)
sx, sy, sz = image.GetSpacing()
fig, axes = plt.subplots(1, 3)
axes[0].imshow(vol[s_idx, :, :], cmap="gray", aspect=sy / sx)  # axial
axes[1].imshow(vol[:, p_idx, :], cmap="gray", aspect=sz / sx)  # coronal
axes[2].imshow(vol[:, :, l_idx], cmap="gray", aspect=sz / sy)  # sagittal
```
