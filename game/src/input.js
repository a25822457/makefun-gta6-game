// Sol Bay: keyboard + mouse (pointer lock) state.
// The main loop reads this every fixed step and calls endFrame() once per
// frame so edge-triggered keys only fire on the frame they went down.
export class Input {
  constructor(canvas) {
    this.canvas = canvas || null;
    this._down = new Set();
    this._pressed = new Set();
    this._dx = 0;
    this._dy = 0;
    this._mouseDown = false;
    this._locked = false;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      if (!this._down.has(e.code)) this._pressed.add(e.code);
      this._down.add(e.code);
      // Keep Space / arrows from scrolling the page while playing.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this._down.delete(e.code);
    };
    this._onMouseMove = (e) => {
      if (!this._locked) return;
      this._dx += e.movementX || 0;
      this._dy += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this._mouseDown = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this._mouseDown = false;
    };
    this._onLockChange = () => {
      this._locked = document.pointerLockElement === this.canvas;
      if (!this._locked) this._mouseDown = false;
    };
    this._onClick = () => {
      if (this.canvas && !this._locked && this.canvas.requestPointerLock) {
        this.canvas.requestPointerLock();
      }
    };
    this._onBlur = () => {
      this._down.clear();
      this._pressed.clear();
      this._mouseDown = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
    if (this.canvas) this.canvas.addEventListener('click', this._onClick);
  }

  /** True while the key is held down. */
  isDown(code) {
    return this._down.has(code);
  }

  /** True only on the frame the key went down (cleared by endFrame). */
  wasPressed(code) {
    return this._pressed.has(code);
  }

  /** Accumulated pointer-lock mouse movement since the last endFrame. */
  get mouseDX() {
    return this._dx;
  }

  get mouseDY() {
    return this._dy;
  }

  /** True while the left mouse button is held. */
  get mouseDown() {
    return this._mouseDown;
  }

  /** True while the canvas holds pointer lock. */
  get pointerLocked() {
    return this._locked;
  }

  /** Called once per frame by the main loop: clears edges + mouse deltas. */
  endFrame() {
    this._pressed.clear();
    this._dx = 0;
    this._dy = 0;
  }

  /** Detach every listener (used when the game is torn down). */
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('blur', this._onBlur);
    if (this.canvas) this.canvas.removeEventListener('click', this._onClick);
  }
}
