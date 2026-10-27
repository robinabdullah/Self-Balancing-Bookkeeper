// D-039: the logo has a white background, so it sits on a small white rounded tile in every
// theme (its black "S" stays visible in Dark and Night Owl). Decorative: the name is beside it.
export function BusinessLogo({ src, size }: { src: string; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny cached route, not worth next/image
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-md bg-white object-contain p-0.5"
      style={{ width: size, height: size }}
    />
  );
}
