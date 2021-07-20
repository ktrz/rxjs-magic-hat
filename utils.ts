export const createDraggableDiv = (): HTMLDivElement => {
  const div = document.createElement('div');
  div.classList.add('draggable');
  div.classList.add('animate');
  div.style.background = generateRandomColor();
  return div;
};

function generateRandomColor() {
  const colPart = () => Math.floor(Math.random() * 255);
  return `rgb(${colPart()}, ${colPart()}, ${colPart()})`;
}
