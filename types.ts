export interface TouchEventGrouped {
  id: number;
  touch: Touch;
  originalEvent: TouchEvent;
}

export interface DragMoveEvent {
  id: number;
  target: EventTarget;
  originalEvent: MouseEvent | TouchEvent;
  startOffsetX: number;
  startOffsetY: number;
  deltaX: number;
  deltaY: number;
  offsetX: number;
  offsetY: number;
}