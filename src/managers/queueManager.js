const config = require('../config');

const LOOP_MODES = {
  OFF: 0,
  TRACK: 1,
  QUEUE: 2
};

const LOOP_NAMES = {
  [LOOP_MODES.OFF]: 'Off ⏹️',
  [LOOP_MODES.TRACK]: 'Track 🔂',
  [LOOP_MODES.QUEUE]: 'Queue 🔁'
};

class QueueManager {
  constructor() {
    this.queue = [];
    this.history = [];
    this.current = null;
    this.loopMode = LOOP_MODES.OFF;
  }

  /**
   * Adds a single track to the end of the queue.
   * @param {object} track
   * @returns {boolean} True if added, false if max queue limit reached.
   */
  add(track) {
    if (this.queue.length >= config.MAX_QUEUE_SIZE) {
      return false;
    }
    this.queue.push(track);
    return true;
  }

  /**
   * Adds multiple tracks (e.g. from a playlist).
   * @param {Array<object>} tracks
   * @returns {number} Number of tracks added.
   */
  addTracks(tracks) {
    let added = 0;
    for (const track of tracks) {
      if (this.queue.length >= config.MAX_QUEUE_SIZE) break;
      this.queue.push(track);
      added++;
    }
    return added;
  }

  /**
   * Inserts a track to be played next.
   * @param {object} track
   */
  addNext(track) {
    this.queue.unshift(track);
  }

  /**
   * Advances queue and returns the next track to play based on loop mode.
   * @returns {object|null} Next track to play or null if queue is finished.
   */
  next() {
    if (this.current) {
      // Handle Loop Modes
      if (this.loopMode === LOOP_MODES.TRACK) {
        return this.current;
      }

      if (this.loopMode === LOOP_MODES.QUEUE) {
        this.queue.push(this.current);
      }

      // Record in history (avoiding consecutive duplicate loops)
      this.history.unshift(this.current);
      if (this.history.length > config.MAX_HISTORY_SIZE) {
        this.history.pop();
      }
    }

    if (this.queue.length === 0) {
      this.current = null;
      return null;
    }

    this.current = this.queue.shift();
    return this.current;
  }

  /**
   * Restores and returns the previous track from history.
   * @returns {object|null}
   */
  previous() {
    if (this.history.length === 0) return null;

    const prevTrack = this.history.shift();
    if (this.current) {
      // Put current back at head of queue
      this.queue.unshift(this.current);
    }
    this.current = prevTrack;
    return this.current;
  }

  /**
   * Shuffles the upcoming queue.
   */
  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  /**
   * Removes a track at a 1-based index.
   * @param {number} index1Based
   * @returns {object|null}
   */
  remove(index1Based) {
    const idx = index1Based - 1;
    if (idx >= 0 && idx < this.queue.length) {
      return this.queue.splice(idx, 1)[0];
    }
    return null;
  }

  /**
   * Clears the upcoming queue.
   */
  clear() {
    this.queue = [];
  }

  /**
   * Cycles loop mode: OFF -> TRACK -> QUEUE -> OFF
   * @returns {number} New loop mode
   */
  cycleLoop() {
    if (this.loopMode === LOOP_MODES.OFF) {
      this.loopMode = LOOP_MODES.TRACK;
    } else if (this.loopMode === LOOP_MODES.TRACK) {
      this.loopMode = LOOP_MODES.QUEUE;
    } else {
      this.loopMode = LOOP_MODES.OFF;
    }
    return this.loopMode;
  }

  /**
   * Sets a specific loop mode.
   * @param {number} mode
   */
  setLoop(mode) {
    this.loopMode = mode;
  }

  /**
   * Calculates total duration of remaining tracks in queue.
   * @returns {number} seconds
   */
  getTotalDuration() {
    return this.queue.reduce((acc, t) => acc + (t.duration || 0), 0);
  }

  /**
   * Resets entire queue, history, and current song.
   */
  destroy() {
    this.queue = [];
    this.history = [];
    this.current = null;
    this.loopMode = LOOP_MODES.OFF;
  }
}

module.exports = {
  QueueManager,
  LOOP_MODES,
  LOOP_NAMES
};
