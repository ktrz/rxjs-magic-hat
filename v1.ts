import {
  fromEvent,
  animationFrameScheduler,
  combineLatest,
  Observable,
  GroupedObservable,
  merge,
  defer,
  EMPTY,
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
} from 'rxjs/operators';

import {TouchEventGrouped, DragMoveEvent} from './types'

const appDiv = document.getElementById('app');


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
      map(() => {
        const div = document.createElement('div');
        div.classList.add('draggable');
        div.classList.add('animate');
        div.style.background = generateRandomColor();
        return div;
      }),
      tap((div: HTMLDivElement) => {
        //makeDraggable(div);
        createNewElementOnDragStart(div);
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

function makeDraggable(element: HTMLElement) {
  const { dragMove$, dragStart$, dragEnd$ } = createDragEvents(element);

  updatePosition(dragMove$);

  combineLatest([
    dragStart$.pipe(
      tap(event =>
        element.dispatchEvent(new CustomEvent('dragstart', { detail: event }))
      )
    ),
    dragEnd$.pipe(
      tap(event =>
        element.dispatchEvent(new CustomEvent('dragend', { detail: event }))
      )
    ),
    dragMove$.pipe(
      tap(event =>
        element.dispatchEvent(new CustomEvent('dragmove', { detail: event }))
      )
    )
  ]).subscribe();
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

function createDragEvents(element: HTMLElement) {
  const {
    dragStartMouse$,
    dragMoveMouse$,
    dragEndMouse$
  } = createMouseBasedEvents(element);

  const {
    dragStartTouch$,
    dragMoveTouch$,
    dragEndTouch$
  } = createTouchBasedEvents(element);

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

  const resetTouchStart$ = defer(() => touchEnd$).pipe(map(() => null));

  const groupedTouchStart$ = touchStart$.pipe(groupTouchEvents());
  const groupedTouchMove$ = touchMove$.pipe(groupTouchEvents());
  const groupedTouchEnd$ = touchEnd$.pipe(groupTouchEvents());

  const dragStartTouch$: Observable<
    TouchEventGrouped
  > = groupedTouchStart$.pipe(
    switchMap((touchStart$: Observable<TouchEventGrouped>) =>
      merge(touchStart$, resetTouchStart$).pipe(
        distinctUntilChanged(
          (a, b) => a === b,
          (event: any) => event?.id ?? -1
        ),
        filter(Boolean)
      )
    )
  );

  const dragMoveTouch$ = dragStartTouch$.pipe(
    switchMap((start: TouchEventGrouped) =>
      groupedTouchMove$.pipe(
        filterGroupedEvents(start.id),
        startWith(start),
        takeUntil(groupedTouchEnd$.pipe(filterGroupedEvents(start.id))),
        map(touchToDragEvent(start))
      )
    )
  );

  const dragEndTouch$ = dragStartTouch$.pipe(
    switchMap((start: TouchEventGrouped) =>
      groupedTouchMove$.pipe(
        filterGroupedEvents(start.id),
        startWith(start),
        takeUntil(groupedTouchEnd$.pipe(filterGroupedEvents(start.id))),
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