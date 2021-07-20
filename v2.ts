import {
  fromEvent,
  animationFrameScheduler,
  combineLatest,
  Observable,
  GroupedObservable,
  merge,
  defer,
  EMPTY,
  of
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
  filter,
  concatMap,
  groupBy,
  mergeMap,
  ignoreElements, exhaustMap
} from 'rxjs/operators';

import {TouchEventGrouped, DragMoveEvent} from './types'
import { createDraggableDiv } from './utils';

const appDiv = document.getElementById('app');

const mouseUp$ = fromEvent(document, 'mouseup');
const mouseMove$ = fromEvent(document, 'mousemove');
const mouseDownDocument$ = fromEvent(document, 'mousedown');

const touchEnd$: Observable<TouchEvent> = fromEvent(document, 'touchend');
const touchMove$: Observable<TouchEvent> = fromEvent(document, 'touchmove', {
  passive: false
});

const touchStartDocument$: Observable<TouchEvent> = fromEvent(
  document,
  'touchstart',
  {
    passive: false
  }
);

const isDraggableElement = (e: EventTarget) => {
  const e_ = e as HTMLElement;
  return e_.classList.contains('draggable');
};

createDraggableElements().forEach(createNewElementOnDragStart);

function createNewElementOnDragStart(element) {
  fromEvent(element, 'dragstart')
    .pipe(
      first(),
      map(createDraggableDiv),
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

  makeDraggable(isDraggableElement);

  return draggableElements;
}

function makeDraggable(isDraggable: (el: HTMLElement) => boolean) {
  const {
    dragStartMouse$,
    dragMoveMouse$,
    dragEndMouse$
  } = createMouseBasedEvents(isDraggable);

  const {
    dragStartTouch$,
    dragMoveTouch$,
    dragEndTouch$
  } = createTouchBasedEvents(isDraggable);

  const dragStart$ = merge(dragStartMouse$, dragStartTouch$);
  const dragMove$ = merge(dragMoveMouse$, dragMoveTouch$);
  const dragEnd$ = merge(dragEndMouse$, dragEndTouch$);

  updatePosition(dragMove$);

  combineLatest([
    dragStart$.pipe(tap(dispatchEvent('dragstart'))),
    dragEnd$.pipe(tap(dispatchEvent('dragend'))),
    dragMove$.pipe(tap(dispatchEvent('dragmove')))
  ]).subscribe();
}

function dispatchEvent(eventName: string) {
  return (event: DragMoveEvent) =>
    event.target.dispatchEvent(
      new CustomEvent(eventName, { detail: event, bubbles: true })
    );
}

function updatePosition(dragMove$: Observable<DragMoveEvent>) {
  const changePosition$ = dragMove$.pipe(
    subscribeOn(animationFrameScheduler),
    tap((e: DragMoveEvent) => e.originalEvent.preventDefault()),
    tap(({ offsetX, offsetY, target }: DragMoveEvent) => {
      (target as HTMLElement).style.left = offsetX + 'px';
      (target as HTMLElement).style.top = offsetY + 'px';
    })
  );

  return changePosition$.subscribe();
}

function createMouseBasedEvents(isDraggable: (el: EventTarget) => boolean) {
  const mouseDown$ = mouseDownDocument$.pipe(
    filter((e: MouseEvent) => isDraggable(e.target))
  );
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

function groupTouchEvents(
  predicate: (el: EventTarget) => boolean = () => true
) {
  return (observable: Observable<TouchEvent>) => {
    return observable.pipe(
      concatMap((originalEvent: TouchEvent) =>
        Array.from(originalEvent.changedTouches).map(touch => ({
          id: touch.identifier,
          touch,
          originalEvent
        }))
      ),
      filter((e: TouchEventGrouped) => predicate(e.touch.target)),
      groupBy(({ touch }) => touch.identifier)
    );
  };
}

function filterGroupedEvents(id: number) {
  return (
    observable: Observable<GroupedObservable<number, TouchEventGrouped>>
  ) =>
    observable.pipe(
      mergeMap((touch$: GroupedObservable<number, TouchEventGrouped>) =>
        touch$.key === id ? touch$ : EMPTY
      )
    );
}

function filterGroupedEvents2(id: number, target: EventTarget) {
  return (
    observable: Observable<GroupedObservable<number, TouchEventGrouped>>
  ) =>
    observable.pipe(
      mergeMap((touch$: GroupedObservable<number, TouchEventGrouped>) =>
        touch$.key === id 
          ? touch$.pipe(
            filter((e: TouchEventGrouped) => e.touch.target === target),
          ) 
          : EMPTY
      )
    );
}

function createTouchBasedEvents(isDraggable: (el: EventTarget) => boolean) {
  const resetTouchStart$ = (id: number) =>  defer(() => groupedTouchEnd$)
    .pipe(
      filterGroupedEvents(id),
      map(() => null),
    );

  const groupedTouchStart$ = touchStartDocument$.pipe(
    groupTouchEvents(isDraggable),
    mergeMap((touchStart$: GroupedObservable<number, TouchEventGrouped>) =>
      merge(touchStart$, resetTouchStart$(touchStart$.key)).pipe(
        distinctUntilChanged(
          (a, b) => a === b,
          (event: any) => event?.id ?? -1
        ),
        filter(Boolean)
      )
    )
  );
  const groupedTouchMove$ = touchMove$.pipe(groupTouchEvents(isDraggable));
  const groupedTouchEnd$ = touchEnd$.pipe(groupTouchEvents(isDraggable));

  const mappingOperator = switchMap

  const dragStartTouch$: Observable<
    TouchEventGrouped
  > = groupedTouchStart$.pipe(
    mappingOperator((start: TouchEventGrouped) =>
      merge(
        of(start),
        groupedTouchMove$.pipe(
          filterGroupedEvents2(start.id, start.touch.target),
          takeUntil(groupedTouchEnd$.pipe(filterGroupedEvents(start.id))),
          map(touchToDragEvent(start)),
          ignoreElements()
        )
      )
    ),
  );

  const dragMoveTouch$ = dragStartTouch$.pipe(
    mappingOperator((start: TouchEventGrouped) =>
      groupedTouchMove$.pipe(
        filterGroupedEvents2(start.id, start.touch.target),
        startWith(start),
        takeUntil(groupedTouchEnd$.pipe(filterGroupedEvents(start.id))),
        map(touchToDragEvent(start)),
      )
    ),
  );

  const dragEndTouch$ = dragStartTouch$.pipe(
    mappingOperator((start: TouchEventGrouped) =>
      groupedTouchMove$.pipe(
        filterGroupedEvents(start.id),
        startWith(start),
        takeUntil(
          groupedTouchEnd$.pipe(
            filterGroupedEvents(start.id),
          )
        ),
        map(touchToDragEvent(start)),
        last()
      )
    )
  );

  return {
    dragStartTouch$: dragStartTouch$.pipe(
      map((start: TouchEventGrouped) => touchToDragEvent(start)(start))
    ),
    dragMoveTouch$,
    dragEndTouch$
  };
}

function toDragEvent(start: MouseEvent) {
  return (moveEvent: MouseEvent): DragMoveEvent => {
    return {
      id: 0,
      target: start.target,
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

function touchToDragEvent(start: TouchEventGrouped) {
  const startOffsetX =
    start.touch.clientX -
    (start.originalEvent.target as HTMLElement).offsetLeft;
  const startOffsetY =
    start.touch.clientY - (start.originalEvent.target as HTMLElement).offsetTop;

  return (moveEvent: TouchEventGrouped): DragMoveEvent => {
    const offsetX = moveEvent.touch.clientX - startOffsetX;
    const offsetY = moveEvent.touch.clientY - startOffsetY;

    return {
      id: moveEvent.id,
      target: start.touch.target,
      originalEvent: moveEvent.originalEvent,
      deltaX: moveEvent.touch.pageX - start.touch.pageX,
      deltaY: moveEvent.touch.pageY - start.touch.pageY,
      startOffsetX,
      startOffsetY,
      offsetX,
      offsetY
    };
  };
}

function generateRandomColor() {
  const colPart = () => Math.floor(Math.random() * 255);
  return `rgb(${colPart()}, ${colPart()}, ${colPart()})`;
}
