// Import stylesheets
import './style.css';

const appDiv = document.getElementById('app');
appDiv.innerHTML = `
  <h1>Magic hat 🎩</h1>
  <h3>Drag me ↓↓↓↓</h3>
  <span class="tophat">🎩</span>
  <div class="draggable"></div>
`;

import './v2';

appDiv.addEventListener('dragstart', (e: CustomEvent) => {
  console.log('dragstart', e.detail);
});
// appDiv.addEventListener('dragmove', (e: CustomEvent) => {
//   console.log('dragmove', e.detail);
// });
appDiv.addEventListener('dragend', (e: CustomEvent) => {
  console.log('dragend', e.detail);
});
