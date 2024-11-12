#!/usr/bin/env python

from PIL import Image, ImageOps
import os
import sys


def resize_image(input_image_path, output_image_path, w):
    with open(input_image_path, "rb") as file:
        img = Image.open(file)
        img = ImageOps.exif_transpose(img)
        img.save(
            output_image_path,
            format="PNG" if input_image_path.endswith(".png") else "JPEG",
        )
        os.system(
            f"mogrify -resize {w}x -unsharp 0.5x0.5+0.5+0.008 {output_image_path} &> /dev/null"
        )
        print(f"Resized image to {w}")


# main function, takes in the input image path
def main(input_image_path):
    with open(input_image_path, "rb") as file:
        img = Image.open(file)
        img = ImageOps.exif_transpose(img)
        width, _ = img.size
        w = 480
        while w < width:
            # append w to the input image path without the extension
            output_image_path = (
                input_image_path.split(".")[0]
                + f"@{w}w.{input_image_path.split('.')[1]}"
            )
            resize_image(input_image_path, output_image_path, w)
            w *= 2
        print("Done resizing images")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python image-resize.py <input_image_path>")
        sys.exit(1)
    input_image_path = sys.argv[1]
    main(input_image_path)
