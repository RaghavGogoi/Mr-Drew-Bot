const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} = require('@discordjs/voice');
const config = require('../config');
const { QueueManager, LOOP_MODES } = require('./queueManager');
const { createAudioStream, prefetchTrackStream } = require('../services/audioExtractor');
const { cleanupTempFile } = require('../services/fileHandler');
const { createNowPlayingEmbed, createErrorEmbed, createInfoEmbed } = require('../ui/embeds');
const { createMusicControllerRows } = require('../ui/components');

class MusicManager {
  /**
   * @param {import('discord.js').Client} client
   * @param {string} guildId
   */
  constructor(client, guildId) {
    this.client = client;
    this.guildId = guildId;

    this.queue = new QueueManager();
    this.voiceConnection = null;
    this.voiceChannel = null;
    this.textChannel = null;

    this.audioPlayer = createAudioPlayer();
    this.audioResource = null;
    this.activeStreamCleanup = null;

    this.volume = config.DEFAULT_VOLUME;
    this.isPaused = false;
    this.isPlaying = false;

    // Time tracking for live progress bar
    this.playbackStartTime = 0;
    this.pauseStartTime = 0;
    this.accumulatedPauseMs = 0;

    // Interactive controller message
    this.controllerMessage = null;

    // Disconnect timer ONLY triggers when everyone leaves the VC
    this.emptyVoiceTimer = null;

    this._setupPlayerListeners();
  }

  _setupPlayerListeners() {
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this._cleanupCurrentStream();
      this.isPlaying = false;
      this.playNext();
    });

    this.audioPlayer.on('error', (err) => {
      console.error(`[Guild ${this.guildId} AudioPlayer Error]:`, err.message);
      this._cleanupCurrentStream();
      this.isPlaying = false;

      if (this.textChannel) {
        const errorEmbed = createErrorEmbed({
          title: 'Playback Stream Error',
          description: `An error occurred during audio streaming: \`${err.message.slice(0, 150)}\`.\nSkipping to the next track in queue...`,
          fields: [
            { name: '🔄 Action', value: 'Auto-skipping problematic track', inline: true }
          ]
        });
        this.textChannel.send({ embeds: [errorEmbed] }).catch(() => {});
      }

      this.playNext();
    });
  }

  /**
   * Connects to a voice channel or moves to it if already connected elsewhere in the guild.
   *
   * @param {import('discord.js').VoiceBasedChannel} voiceChannel
   * @param {import('discord.js').TextBasedChannel} textChannel
   */
  async connect(voiceChannel, textChannel) {
    this.voiceChannel = voiceChannel;
    if (textChannel) {
      this.textChannel = textChannel;
    }

    // Check if humans are currently in this channel
    this.checkVoiceChannelMembers();

    if (!this.voiceConnection || this.voiceConnection.state.status === VoiceConnectionStatus.Destroyed) {
      this.voiceConnection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: this.guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
      });

      this.voiceConnection.subscribe(this.audioPlayer);

      this.voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          // Attempt reconnection in case of temporary disconnect or voice server migration
          await Promise.race([
            entersState(this.voiceConnection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5_000)
          ]);
        } catch {
          // Permanently disconnected
          this.destroy();
        }
      });

      this.voiceConnection.on(VoiceConnectionStatus.Destroyed, () => {
        this.destroy();
      });

      try {
        await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
      } catch (err) {
        console.error('[MusicManager] Voice connection failed to ready:', err);
        this.destroy();
        throw new Error('Could not connect to voice channel within 20 seconds!');
      }
    }
  }

  /**
   * Plays the next track from the queue.
   */
  async playNext() {
    if (this.isPlaying) return;

    // Auto-cleanup local upload file of previous song if done playing
    const finishedTrack = this.queue.current;
    if (finishedTrack && finishedTrack.isLocalFile && finishedTrack.localPath) {
      if (this.queue.loopMode !== LOOP_MODES.TRACK) {
        const isQueuedAgain = this.queue.queue.some((t) => t.localPath === finishedTrack.localPath);
        if (!isQueuedAgain) {
          cleanupTempFile(finishedTrack.localPath);
          finishedTrack.localPath = null;
        }
      }
    }

    const track = this.queue.next();
    if (!track) {
      this.isPlaying = false;
      this.isPaused = false;
      this._cleanupCurrentStream();

      // Ensure empty VC check is active if all humans left
      this.checkVoiceChannelMembers();

      if (this.textChannel) {
        const infoEmbed = createInfoEmbed({
          title: 'Queue Finished',
          description: 'All queued songs have finished playing! The bot will remain in the voice channel waiting for your next song.',
          fields: [
            { name: '💡 Add More Music', value: 'Use `/play [query]`, `/playfile [file]`, or `/lofi` to resume playback anytime!', inline: false }
          ]
        });
        this.textChannel.send({ embeds: [infoEmbed] }).catch(() => {});
      }
      return;
    }

    this.cancelEmptyVoiceTimer();
    this.isPlaying = true;
    this.isPaused = false;
    this.playbackStartTime = Date.now();
    this.pauseStartTime = 0;
    this.accumulatedPauseMs = 0;

    try {
      const { stream, cleanup } = createAudioStream(track, 0);
      this.activeStreamCleanup = cleanup;

      this.audioResource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });

      this.audioResource.volume?.setVolume(this.volume / 100);
      this.audioPlayer.play(this.audioResource);

      // Pre-fetch the next track in queue in background for zero-gap playback transition
      if (this.queue.queue.length > 0) {
        prefetchTrackStream(this.queue.queue[0]).catch(() => {});
      }

      // Send or update controller embed
      await this.sendControllerMessage(track);
    } catch (err) {
      console.error('[MusicManager] Error playing track:', err);
      this.isPlaying = false;
      this._cleanupCurrentStream();

      if (this.textChannel) {
        const failEmbed = createErrorEmbed({
          title: 'Failed to Stream Track',
          description: `Could not extract audio stream for **[${track.title.slice(0, 60)}](${track.webpageUrl || track.url})**: \`${err.message.slice(0, 150)}\`. Skipping...`,
          fields: [
            { name: '👤 Artist', value: track.artist || 'Unknown', inline: true },
            { name: '📡 Source', value: track.source || 'Web Audio', inline: true }
          ]
        });
        this.textChannel.send({ embeds: [failEmbed] }).catch(() => {});
      }

      this.playNext();
    }
  }

  /**
   * Sends or updates the persistent Now Playing Controller message.
   * @param {object} [track]
   */
  async sendControllerMessage(track = this.queue.current) {
    if (!track || !this.textChannel) return;

    const guild = this.client.guilds.cache.get(this.guildId);
    const guildName = guild?.name || 'Discord Server';
    const channelName = this.voiceChannel?.name || 'Voice Channel';

    const playerState = {
      isPaused: this.isPaused,
      volume: this.volume,
      elapsedSeconds: this.getElapsedSeconds(),
      hasPrevious: this.queue.history.length > 0
    };

    const embed = createNowPlayingEmbed(
      track,
      playerState,
      this.queue,
      guildName,
      channelName
    );

    const components = createMusicControllerRows(playerState, this.queue.loopMode);

    try {
      if (this.controllerMessage && !this.controllerMessage.deleted) {
        await this.controllerMessage.edit({
          embeds: [embed],
          components
        }).catch(async () => {
          this.controllerMessage = await this.textChannel.send({ embeds: [embed], components });
        });
      } else {
        this.controllerMessage = await this.textChannel.send({ embeds: [embed], components });
      }
    } catch (err) {
      console.error('[MusicManager] Could not send controller message:', err.message);
    }
  }

  /**
   * Calculates elapsed playback time in seconds.
   * @returns {number}
   */
  getElapsedSeconds() {
    if (!this.playbackStartTime) return 0;
    const now = this.isPaused ? this.pauseStartTime : Date.now();
    return Math.max(0, (now - this.playbackStartTime - this.accumulatedPauseMs) / 1000);
  }

  /**
   * Toggles pause / resume.
   * @returns {boolean} New paused state
   */
  togglePause() {
    if (this.isPaused) {
      this.audioPlayer.unpause();
      this.accumulatedPauseMs += (Date.now() - this.pauseStartTime);
      this.isPaused = false;
    } else {
      this.audioPlayer.pause();
      this.pauseStartTime = Date.now();
      this.isPaused = true;
    }

    this.sendControllerMessage();
    return this.isPaused;
  }

  /**
   * Skips currently playing track.
   */
  skip() {
    this._cleanupCurrentStream();
    this.audioPlayer.stop(true);
  }

  /**
   * Plays the previous track from history.
   * @returns {boolean}
   */
  previous() {
    const prev = this.queue.previous();
    if (!prev) return false;

    this._cleanupCurrentStream();
    this.isPlaying = false;
    this.audioPlayer.stop(true);
    this.playNext();
    return true;
  }

  /**
   * Sets volume between 1% and 200%.
   * @param {number} level
   */
  setVolume(level) {
    this.volume = Math.max(1, Math.min(200, Math.round(level)));
    if (this.audioResource?.volume) {
      this.audioResource.volume.setVolume(this.volume / 100);
    }
    this.sendControllerMessage();
    return this.volume;
  }

  /**
   * Cycles loop mode.
   * @returns {number}
   */
  cycleLoop() {
    const newMode = this.queue.cycleLoop();
    this.sendControllerMessage();
    return newMode;
  }

  /**
   * Shuffles the upcoming queue.
   */
  shuffle() {
    this.queue.shuffle();
    this.sendControllerMessage();
  }

  /**
   * Seeks to a specific position in the current track.
   * @param {number} seconds
   */
  async seek(seconds) {
    const track = this.queue.current;
    if (!track) return false;

    this._cleanupCurrentStream();
    this.playbackStartTime = Date.now() - (seconds * 1000);
    this.pauseStartTime = 0;
    this.accumulatedPauseMs = 0;

    try {
      const { stream, cleanup } = createAudioStream(track, seconds);
      this.activeStreamCleanup = cleanup;

      this.audioResource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });

      this.audioResource.volume?.setVolume(this.volume / 100);
      this.audioPlayer.play(this.audioResource);

      await this.sendControllerMessage(track);
      return true;
    } catch (err) {
      console.error('[MusicManager] Seek error:', err);
      return false;
    }
  }

  /**
   * Stops playback and clears the queue, but remains connected in the voice channel.
   */
  stopPlayback() {
    this._cleanupCurrentStream();

    // Delete any local upload files remaining in the queue or playing
    for (const t of this.queue.queue) {
      if (t.isLocalFile && t.localPath) {
        cleanupTempFile(t.localPath);
        t.localPath = null;
      }
    }
    if (this.queue.current && this.queue.current.isLocalFile && this.queue.current.localPath) {
      cleanupTempFile(this.queue.current.localPath);
      this.queue.current.localPath = null;
    }

    this.queue.destroy();
    this.audioPlayer.stop(true);
    this.isPlaying = false;
    this.isPaused = false;
    this.playbackStartTime = 0;
    this.pauseStartTime = 0;
    this.accumulatedPauseMs = 0;

    if (this.controllerMessage && !this.controllerMessage.deleted) {
      this.controllerMessage.edit({ components: [] }).catch(() => {});
      this.controllerMessage = null;
    }
  }

  /**
   * Stops playback and explicitly leaves the voice channel.
   */
  disconnect() {
    this.stopPlayback();
    this.destroy();
  }

  _cleanupCurrentStream() {
    if (this.activeStreamCleanup) {
      try {
        this.activeStreamCleanup();
      } catch (_) {}
      this.activeStreamCleanup = null;
    }
  }

  /**
   * Checks if all human listeners have left the voice channel.
   * Only starts countdown if human count is strictly 0.
   */
  checkVoiceChannelMembers() {
    if (!this.voiceChannel) return;
    const guild = this.client.guilds.cache.get(this.guildId);
    const channel = guild?.channels.cache.get(this.voiceChannel.id);
    if (!channel) return;

    const humans = channel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      this.startEmptyVoiceTimer();
    } else {
      this.cancelEmptyVoiceTimer();
    }
  }

  startEmptyVoiceTimer() {
    if (this.emptyVoiceTimer) return; // Countdown already running

    console.log(`[Guild ${this.guildId}] All humans left VC. Starting empty VC disconnect timer (${config.EMPTY_VC_TIMEOUT_MS / 1000}s)...`);

    this.emptyVoiceTimer = setTimeout(() => {
      // Re-verify that human count is still 0
      const guild = this.client.guilds.cache.get(this.guildId);
      const channel = this.voiceChannel ? guild?.channels.cache.get(this.voiceChannel.id) : null;
      const humans = channel?.members.filter((m) => !m.user.bot);

      if (!humans || humans.size === 0) {
        if (this.textChannel) {
          const leaveEmbed = createInfoEmbed({
            title: 'Auto-Disconnected',
            description: 'Left the voice channel because all listeners have departed.',
            fields: [
              { name: '👋 Status', value: 'Voice session ended (channel empty)', inline: true },
              { name: '💡 Reconnect', value: 'Join any voice channel and run `/play` to start again!', inline: false }
            ]
          });
          this.textChannel.send({ embeds: [leaveEmbed] }).catch(() => {});
        }
        this.destroy();
      } else {
        this.emptyVoiceTimer = null;
      }
    }, config.EMPTY_VC_TIMEOUT_MS);
  }

  cancelEmptyVoiceTimer() {
    if (this.emptyVoiceTimer) {
      console.log(`[Guild ${this.guildId}] User active in VC. Empty VC timer cancelled.`);
      clearTimeout(this.emptyVoiceTimer);
      this.emptyVoiceTimer = null;
    }
  }

  /**
   * Completely destroys connection and removes from client map.
   */
  destroy() {
    this.cancelEmptyVoiceTimer();
    this._cleanupCurrentStream();

    if (this.controllerMessage && !this.controllerMessage.deleted) {
      this.controllerMessage.edit({ components: [] }).catch(() => {});
    }

    try {
      this.audioPlayer.stop(true);
    } catch (_) {}

    if (this.voiceConnection) {
      try {
        this.voiceConnection.destroy();
      } catch (_) {}
      this.voiceConnection = null;
    }

    this.client.musicManagers.delete(this.guildId);
  }
}

/**
 * Gets or creates the MusicManager for a guild.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @returns {MusicManager}
 */
function getOrCreateMusicManager(client, guildId) {
  if (!client.musicManagers) {
    client.musicManagers = new Map();
  }

  let manager = client.musicManagers.get(guildId);
  if (!manager) {
    manager = new MusicManager(client, guildId);
    client.musicManagers.set(guildId, manager);
  }

  return manager;
}

module.exports = {
  MusicManager,
  getOrCreateMusicManager
};
