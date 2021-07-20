// Import stylesheets
import './style.css';

import {
  fromEvent,
  animationFrameScheduler,
  combineLatest,
  Observable,
  merge,
  defer
} from 'rxjs';
import {
  map,
  takeUntil,
  last,
  tap,
  subscribeOn,
  switchMap,
  first,
  startWith,
  distinctUntilChanged,
  filter
} from 'rxjs/operators';
import { createDraggableDiv } from './utils';

const appDiv = document.getElementById('app');

interface DragMoveEvent {
  originalEvent: MouseEvent | TouchEvent;
  startOffsetX: number;
  startOffsetY: number;
  deltaX: number;
  deltaY: number;
  offsetX: number;
  offsetY: number;
}

const mouseUp$ = fromEvent(document, 'mouseup');
const mouseMove$ = fromEvent(document, 'mousemove');

const touchEnd$: Observable<TouchEvent> = fromEvent(document, 'touchend');
const touchMove$: Observable<TouchEvent> = fromEvent(document, 'touchmove', {
  passive: false
});

createDraggableElements().forEach(createNewElementOnDragStart);

function createNewElementOnDragStart(element) {
  fromEvent(element, 'dragstart')
    .pipe(
      first(),
      map(createDraggableDiv),
      tap(makeDraggable),
      tap(createNewElementOnDragStart),
      tap((div: HTMLDivElement) => {
        appDiv.appendChild(div);
      })
    )
    .subscribe();
}

function createDraggableElements() {
  const draggableElements = Array.from(
    document.getElementsByClassName('draggable')
  );

  draggableElements.forEach(makeDraggable);

  return draggableElements;
}

function makeDraggable(element) {
  const { dragMove$, dragStart$, dragEnd$ } = createDragEvents(element);

  updatePosition(element, dragMove$);

  combineLatest([
    dragStart$.pipe(tap(dispatchEvent(element, 'dragstart'))),
    dragEnd$.pipe(tap(dispatchEvent(element, 'dragend'))),
    dragMove$.pipe(tap(dispatchEvent(element, 'dragmove')))
  ]).subscribe();
}

function createDragEvents(element: HTMLElement) {
  const {
    dragStartMouse$,
    dragMoveMouse$,
    dragEndMouse$
  } = createMouseBasedEvents(element)

  const {
    dragStartTouch$,
    dragMoveTouch$,
    dragEndTouch$
  } = createTouchBasedEvents(element)

  const dragStart$ = merge(dragStartMouse$, dragStartTouch$);
  const dragMove$ = merge(dragMoveMouse$, dragMoveTouch$);
  const dragEnd$ = merge(dragEndMouse$, dragEndTouch$);

  return {
    dragStart$,
    dragEnd$,
    dragMove$
  };
}

function createMouseBasedEvents(element: HTMLElement) {
  const mouseDown$ = fromEvent(element, 'mousedown');

  const dragStartMouse$: Observable<MouseEvent> = mouseDown$.pipe(
    switchMap((start: MouseEvent) =>
      mouseMove$.pipe(
        startWith(start),
        first()
      )
    )
  );

  const dragMoveMouse$ = dragStartMouse$.pipe(
    switchMap((start: MouseEvent) =>
      mouseMove$.pipe(
        startWith(start),
        takeUntil(mouseUp$),
        map(toDragEvent(start))
      )
    )
  );

  const dragEndMouse$ = dragStartMouse$.pipe(
    switchMap((start: MouseEvent) =>
      mouseMove$.pipe(
        startWith(start),
        takeUntil(mouseUp$),
        map(toDragEvent(start)),
        last()
      )
    )
  );

  return {
    dragStartMouse$,
    dragMoveMouse$,
    dragEndMouse$
  };
}

function createTouchBasedEvents(element: HTMLElement) {
  const touchStart$ = fromEvent(element, 'touchstart');

  const resetTouchStart$ = defer(() => touchEnd$).pipe(
    map(() => null),
  );

  const dragStartTouch$: Observable<TouchEvent> = merge(
    touchStart$,
    resetTouchStart$
  ).pipe(
    distinctUntilChanged(
      (a, b) => a === b,
      (event: TouchEvent) => event?.targetTouches[0]?.identifier ?? -1
    ),
    filter(Boolean),
  );

  const dragMoveTouch$ = dragStartTouch$.pipe(
    switchMap((start: TouchEvent) =>
      touchMove$.pipe(
        startWith(start),
        takeUntil(touchEnd$),
        map(touchToDragEvent(start))
      )
    )
  );

  const dragEndTouch$ = dragStartTouch$.pipe(
    switchMap((start: TouchEvent) =>
      touchMove$.pipe(
        startWith(start),
        takeUntil(touchEnd$),
        map(touchToDragEvent(start)),
        last()
      )
    )
  );

  return {
    dragStartTouch$: dragStartTouch$.pipe(
      map((start: TouchEvent) => touchToDragEvent(start)(start))
    ),
    dragMoveTouch$,
    dragEndTouch$
  };
}

function updatePosition(element, dragMove$: Observable<DragMoveEvent>) {
  const changePosition$ = dragMove$.pipe(
    subscribeOn(animationFrameScheduler),
    tap((e: DragMoveEvent) => e.originalEvent.preventDefault()),
    tap(({ offsetX, offsetY }) => {
      element.style.left = offsetX + 'px';
      element.style.top = offsetY + 'px';
    })
  );

  changePosition$.subscribe();
}

function toDragEvent(start: MouseEvent) {
  return (moveEvent: MouseEvent): DragMoveEvent => {
    return {
      originalEvent: moveEvent,
      deltaX: moveEvent.pageX - start.pageX,
      deltaY: moveEvent.pageY - start.pageY,
      startOffsetX: start.offsetX,
      startOffsetY: start.offsetY,
      offsetX: moveEvent.x - start.offsetX,
      offsetY: moveEvent.y - start.offsetY
    };
  };
}

function touchToDragEvent(start: TouchEvent) {
  const startTouch = start.targetTouches[0]
  const target = start.target as HTMLElement
  const startOffsetX = startTouch.clientX - target.offsetLeft;
  const startOffsetY = startTouch.clientY - target.offsetTop;

  return (moveEvent: TouchEvent): DragMoveEvent => {
    const moveTouch = moveEvent.targetTouches[0]
    const offsetX = moveTouch.clientX - startOffsetX;
    const offsetY = moveTouch.clientY - startOffsetY;

    return {
      originalEvent: moveEvent,
      deltaX: moveTouch.pageX - startTouch.pageX,
      deltaY: moveTouch.pageY - startTouch.pageY,
      startOffsetX,
      startOffsetY,
      offsetX,
      offsetY
    };
  };
}

function dispatchEvent(element: HTMLElement, eventName: string) {
  return (event: DragMoveEvent) =>
    element.dispatchEvent(
      new CustomEvent(eventName, { detail: event, bubbles: true })
    );
}

function generateRandomColor() {
  const colPart = () => Math.floor(Math.random() * 255);
  return `rgb(${colPart()}, ${colPart()}, ${colPart()})`;
}
