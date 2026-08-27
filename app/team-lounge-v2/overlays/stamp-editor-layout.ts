export interface EditorPoint {
  x: number;
  y: number;
}

export interface EditorSize {
  width: number;
  height: number;
}

export interface EditorRect extends EditorPoint, EditorSize {}

export interface StampEditorLayout {
  size: EditorRect;
  rotateLeft: EditorRect;
  rotateRight: EditorRect;
  more: EditorRect;
  menu: EditorRect;
}

const margin = 6;
const directions = {
  top: -Math.PI / 2,
  topRight: -Math.PI / 4,
  right: 0,
  bottomRight: Math.PI / 4,
  bottom: Math.PI / 2,
  bottomLeft: (3 * Math.PI) / 4,
  left: Math.PI,
  topLeft: (-3 * Math.PI) / 4,
} as const;

const allDirections = Object.values(directions);

export function layoutStampEditor(
  point: EditorPoint,
  surface: EditorSize,
  objectRadius: number,
): StampEditorLayout {
  const object = centeredRect(point, {
    width: objectRadius * 2,
    height: objectRadius * 2,
  });
  const occupied = [object];
  const baseRadius = objectRadius + 30;
  const size = place(
    point,
    surface,
    { width: 88, height: 42 },
    [
      directions.top,
      directions.topRight,
      directions.topLeft,
      directions.bottom,
    ],
    occupied,
    baseRadius,
  );
  occupied.push(size);
  const rotateLeft = place(
    point,
    surface,
    { width: 42, height: 42 },
    [directions.left, directions.bottomLeft, directions.topLeft],
    occupied,
    baseRadius,
  );
  occupied.push(rotateLeft);
  const rotateRight = place(
    point,
    surface,
    { width: 42, height: 42 },
    [directions.right, directions.bottomRight, directions.topRight],
    occupied,
    baseRadius,
  );
  occupied.push(rotateRight);
  const more = place(
    point,
    surface,
    { width: 42, height: 42 },
    [
      directions.bottom,
      directions.bottomRight,
      directions.bottomLeft,
      directions.top,
    ],
    occupied,
    baseRadius,
  );
  const menu = place(
    point,
    surface,
    { width: 168, height: 88 },
    more.y >= point.y
      ? [
          directions.bottom,
          directions.bottomRight,
          directions.bottomLeft,
          directions.top,
        ]
      : [
          directions.top,
          directions.topRight,
          directions.topLeft,
          directions.bottom,
        ],
    [object, more],
    objectRadius + 56,
  );

  return { size, rotateLeft, rotateRight, more, menu };
}

function place(
  point: EditorPoint,
  surface: EditorSize,
  size: EditorSize,
  preferred: readonly number[],
  occupied: readonly EditorRect[],
  baseRadius: number,
): EditorRect {
  const angles = [
    ...preferred,
    ...allDirections.filter((angle) => !preferred.includes(angle)),
  ];
  for (const extraRadius of [0, 20, 40, 64, 88]) {
    for (const angle of angles) {
      const candidate = clampRect(
        centeredRect(
          {
            x: point.x + Math.cos(angle) * (baseRadius + extraRadius),
            y: point.y + Math.sin(angle) * (baseRadius + extraRadius),
          },
          size,
        ),
        surface,
      );
      if (
        inside(candidate, surface) &&
        occupied.every((rect) => !overlaps(candidate, rect))
      ) {
        return candidate;
      }
    }
  }
  return clampRect(centeredRect(point, size), surface);
}

function centeredRect(point: EditorPoint, size: EditorSize): EditorRect {
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    ...size,
  };
}

function inside(rect: EditorRect, surface: EditorSize): boolean {
  return (
    rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.width <= surface.width - margin &&
    rect.y + rect.height <= surface.height - margin
  );
}

function overlaps(first: EditorRect, second: EditorRect): boolean {
  return !(
    first.x + first.width + margin <= second.x ||
    second.x + second.width + margin <= first.x ||
    first.y + first.height + margin <= second.y ||
    second.y + second.height + margin <= first.y
  );
}

function clampRect(rect: EditorRect, surface: EditorSize): EditorRect {
  return {
    ...rect,
    x: Math.min(surface.width - margin - rect.width, Math.max(margin, rect.x)),
    y: Math.min(
      surface.height - margin - rect.height,
      Math.max(margin, rect.y),
    ),
  };
}
