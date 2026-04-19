---
name: simpleitk
description: Work with medical images using SimpleITK concepts including physical space, transforms, resampling, and image metadata. Use when processing CT, MRI, or volumetric data, converting between voxel and patient coordinate systems, performing segmentation, registration (aligning images). 
license: Apache-2.0
compatibility: Requires Python, SimpleITK, and basic numerical computing libraries (NumPy). Designed for agent-based workflows involving medical imaging.
metadata:
  version: "1.0"
  domain: medical-imaging
---

# Medical Imaging Skill (SimpleITK-Oriented)

## When to Use

Use this skill when:

- Working with CT, MRI, ultrasound, or volumetric datasets
- Performing:
  - Registration (image alignment)
  - Resampling or grid transformations
  - Segmentation or label processing
  - Spatial transformations (rigid, affine, deformable)
- Debugging:
  - Misaligned images
  - Incorrect spacing/orientation
  - Empty resampling outputs

---

## Core Concept: Images Exist in Physical Space

Medical images are not just arrays. Each image represents a region in **physical (patient) space**.

Each image is defined by:

- Origin: physical position of voxel (0,0,0)
- Spacing: voxel size (e.g., mm)
- Size: number of voxels
- Direction: orientation matrix

These define a mapping from index space → physical space.

---

## Coordinate Systems

### Index Space (Voxel Space)

Discrete coordinates:
(i, j, k)

Used for:
- Iteration
- Pixel access

### Physical Space (Patient Space)

Continuous coordinates:
(x, y, z) in mm

Used for:
- Measurement
- Registration
- Alignment

### Rule

Always perform reasoning in **physical space**, not index space.

Never manually compute conversions — use library functions.

---

## Volume vs Patient Space

- Volume space = discrete voxel grid
- Patient space = real-world coordinates

Golden rule:

Always align and compare images in **patient space**

---

## Resampling

Resampling maps an image into a new grid.

Requires:

1. Input image
2. Output grid
3. Transform
4. Interpolator

### Interpolation Rules

- Linear → intensity images (CT/MRI)
- Nearest neighbor → labels/segmentations
- Set resample background value (i.e. SetDefaultPixelValue) to large negative value -2048 rather than zero to avoid clash with water HU values (CT).

### Common Failure

Empty output → wrong transform direction

Fix:
Use inverse transform

---

## Transforms

Transforms map between coordinate systems.

Types:

- Global:
  - Rigid
  - Affine
- Local:
  - B-spline
  - Displacement field

Transforms are composed in reverse order of application.

---

## Functional vs Object-Oriented Interfaces

### Functional

Use for simple pipelines:

sitk.SmoothingRecursiveGaussian(image, sigma=2.0)

### Object-Oriented

Use for control and reuse:

filter = sitk.SmoothingRecursiveGaussianImageFilter()
filter.SetSigma(2.0)
filter.Execute(image)

Rule:

- Functional → quick tasks
- OO → complex workflows

---
## Plotting

When plotting axial, coronal, sagittal slices with matplotlib, care is needed to get flips/orientation as expected. Easiest way is to reformat to LPI: 

```
sitk_to_plot = sitk.DICOMOrient(vol_sitk, "LPI")
np_to_plot = sitk.GetArrayViewFromImage(sitk_to_plot)
```

---

## Common Mistakes

- Treating images as NumPy arrays (ignores spatial metadata)
- Mixing units (mm vs cm)
- Wrong transform direction
- Linear interpolation on labels
- Comparing images in voxel space

---

## Best Practices

- Always check:
  - origin
  - spacing
  - direction
- Resample to a common space before comparison
- Use correct interpolators
- Keep units consistent (mm)

---

## Mental Model

A medical image is:

A sampling of a continuous anatomical structure in 3D space

---

## Examples

### Convert index to physical point

image.TransformIndexToPhysicalPoint((i, j, k))

### Resample image

sitk.Resample(image, reference_image, transform, sitk.sitkLinear, defaultPixelValue=-2048.0)

