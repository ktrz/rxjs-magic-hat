import { fromEvent, animationFrameScheduler, combineLatest } from 'rxjs';
import {
  map,
  takeUntil,
  last,
  tap,
  subscribeOn,
  switchMap,
  first,
  startWith
} from 'rxjs/operators';

const mouseUp$ = fromEvent(document, 'mouseup');
const mouseMove$ = fromEvent(document, 'mousemove');

const appDiv = document.getElementById('app');

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
      tap(div => {
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

    const dragStart$ = mouseDown$.pipe(
      switchMap(start =>
        mouseMove$.pipe(
          startWith(start),
          first()
        )
      )
    );

    const dragMove$ = dragStart$.pipe(
      switchMap(start =>
        mouseMove$.pipe(
          startWith(start),
          map(toDragEvent(start)),
          takeUntil(mouseUp$)
        )
      )
    );

    const dragEnd$ = dragStart$.pipe(
      switchMap(start =>
        mouseMove$.pipe(
          startWith(start),
          takeUntil(mouseUp$),
          last(),
          map(toDragEvent(start))
        )
      )
    );

    return {
      dragStart$,
      dragEnd$,
      dragMove$
    };
  }

  function updatePosition(dragMove$) {
    const changePosition$ = dragMove$.pipe(
      subscribeOn(animationFrameScheduler),
      map(move => ({
        offsetX: move.originalEvent.x - move.startOffsetX,
        offsetY: move.originalEvent.y - move.startOffsetY
      })),
      tap(({ offsetX, offsetY }) => {
        element.style.left = offsetX + 'px';
        element.style.top = offsetY + 'px';
      })
    );

    changePosition$.subscribe();
  }

  function toDragEvent(start) {
    return moveEvent => ({
      originalEvent: moveEvent,
      deltaX: moveEvent.pageX - start.pageX,
      deltaY: moveEvent.pageY - start.pageY,
      startOffsetX: start.offsetX,
      startOffsetY: start.offsetY
    });
  }
}

function generateRandomColor() {
  const colPart = () => Math.floor(Math.random() * 255);
  return `rgb(${colPart()}, ${colPart()}, ${colPart()})`;
}
