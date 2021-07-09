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

const appDiv = document.getElementById('app');
appDiv.innerHTML = `
<h1>Magic hat 🎩</h1>
<h3>Drag me &#8595;&#8595;&#8595;&#8595;</h3>
<span class="tophat">🎩</span>
<div class="draggable"></div>
`;

const mouseUp$ = fromEvent(document, 'mouseup');
const mouseMove$ = fromEvent(document, 'mousemove');

const touchEnd$: Observable<TouchEvent> = fromEvent(document, 'touchend').pipe(
  tap(console.log.bind(console, 'touchend '))
);
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
        makeDraggable(div);
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

function makeDraggable(element) {
  const { dragMove$, dragStart$, dragEnd$ } = createDragEvents();

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

  function createDragEvents() {
    const mouseDown$ = fromEvent(element, 'mousedown');
    const touchStart$ = fromEvent(element, 'touchstart');

    const {
      dragStartMouse$,
      dragMoveMouse$,
      dragEndMouse$
    } = createMouseBasedEvents();

    const {
      dragStartTouch$,
      dragMoveTouch$,
      dragEndTouch$
    } = createTouchBasedEvents();

    const dragStart$ = merge(dragStartMouse$, dragStartTouch$);
    const dragMove$ = merge(dragMoveMouse$, dragMoveTouch$);
    const dragEnd$ = merge(dragEndMouse$, dragEndTouch$);

    return {
      dragStart$,
      dragEnd$,
      dragMove$
    };

    function createMouseBasedEvents() {
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

    function createTouchBasedEvents() {
      const resetTouchStart$ = defer(() => touchEnd$).pipe(
        map(() => null),
        tap(console.log.bind(console, 'resetTouch'))
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
        switchMap((start: TouchEvent) =>
          mouseMove$.pipe(
            startWith(start),
            first()
          )
        )
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
        dragStartTouch$,
        dragMoveTouch$,
        dragEndTouch$
      };
    }
  }

  function updatePosition(dragMove$: Observable<DragMoveEvent>) {
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
}

interface DragMoveEvent {
  originalEvent: MouseEvent | TouchEvent;
  startOffsetX: number;
  startOffsetY: number;
  deltaX: number;
  deltaY: number;
  offsetX: number;
  offsetY: number;
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
  const startOffsetX =
    start.targetTouches[0].clientX - (start.target as HTMLElement).offsetLeft;
  const startOffsetY =
    start.targetTouches[0].clientY - (start.target as HTMLElement).offsetTop;

  return (moveEvent: TouchEvent): DragMoveEvent => {
    const offsetX = moveEvent.targetTouches[0].clientX - startOffsetX;
    const offsetY = moveEvent.targetTouches[0].clientY - startOffsetY;

    return {
      originalEvent: moveEvent,
      deltaX: moveEvent.targetTouches[0].pageX - start.targetTouches[0].pageX,
      deltaY: moveEvent.targetTouches[0].pageY - start.targetTouches[0].pageY,
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
