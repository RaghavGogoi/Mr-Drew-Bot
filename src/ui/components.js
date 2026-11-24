const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { LOOP_MODES } = require('../managers/queueManager');
const { buildPaginationButtons } = require('./pagination');

/**
 * Builds the Interactive Music Controller Button Rows.
 *
 * @param {object} playerState - { isPaused, volume, hasPrevious }
 * @param {number} loopMode - LOOP_MODES enum value
 * @returns {Array<ActionRowBuilder<ButtonBuilder>>}
 */
function createMusicControllerRows(playerState, loopMode) {
  const isPaused = playerState.isPaused;
  const loopLabel =
    loopMode === LOOP_MODES.TRACK ? 'Loop: Track 🔂' :
    loopMode === LOOP_MODES.QUEUE ? 'Loop: Queue 🔁' : 'Loop: Off ⏹️';

  // Row 1: Playback control buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ctrl_prev')
      .setLabel('Previous')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!playerState.hasPrevious),

    new ButtonBuilder()
      .setCustomId('ctrl_play_pause')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('ctrl_skip')
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('ctrl_stop')
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('ctrl_loop')
      .setLabel(loopLabel)
      .setStyle(loopMode !== LOOP_MODES.OFF ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  // Row 2: Queue & Utility buttons
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ctrl_shuffle')
      .setLabel('Shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('ctrl_queue')
      .setLabel('Queue')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('ctrl_history')
      .setLabel('History')
      .setEmoji('🕒')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('ctrl_volume')
      .setLabel(`Vol: ${playerState.volume}%`)
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('ctrl_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

/**
 * Builds full pagination and management rows for the Queue view.
 *
 * @param {number} currentPage
 * @param {number} totalPages
 * @param {number} [queueLength=0]
 * @returns {Array<ActionRowBuilder<ButtonBuilder>>}
 */
function createQueuePaginationRow(currentPage, totalPages, queueLength = 0) {
  const navRow = buildPaginationButtons({
    currentPage,
    totalPages,
    prefix: 'queue_page_',
    disabled: totalPages <= 1
  });

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('queue_clear')
      .setLabel('Clear Queue')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(queueLength === 0),

    new ButtonBuilder()
      .setCustomId('queue_shuffle')
      .setLabel('Shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(queueLength <= 1),

    new ButtonBuilder()
      .setCustomId(`queue_refresh_${currentPage}`)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return [navRow, actionRow];
}

/**
 * Builds full pagination row for the History view.
 *
 * @param {number} currentPage
 * @param {number} totalPages
 * @returns {Array<ActionRowBuilder<ButtonBuilder>>}
 */
function createHistoryPaginationRow(currentPage, totalPages) {
  const navRow = buildPaginationButtons({
    currentPage,
    totalPages,
    prefix: 'hist_page_',
    disabled: totalPages <= 1
  });

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hist_refresh_${currentPage}`)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return [navRow, actionRow];
}

/**
 * Builds category dropdown and pagination buttons for the Help guide.
 *
 * @param {number} currentPage - 1 to 6
 * @param {number} [totalPages=6]
 * @returns {Array<ActionRowBuilder>}
 */
function createHelpPaginationComponents(currentPage = 1, totalPages = 6) {
  const categories = [
    { label: 'Overview & Quick Start', value: '1', emoji: '🌟', desc: 'Welcome, highlights & quick start' },
    { label: 'Playback & Voice Controls', value: '2', emoji: '🚀', desc: '/play, /pause, /skip, /seek, /volume' },
    { label: 'Queue & History Operations', value: '3', emoji: '📜', desc: '/queue, /history, /loop, /shuffle' },
    { label: '24/7 Radio & Lofi Stations', value: '4', emoji: '📻', desc: '/24, /radio, /lofi live streams' },
    { label: 'Supported Sources & Uploads', value: '5', emoji: '📁', desc: 'YouTube, Spotify, local audio files' },
    { label: 'DM Remote Control Guide', value: '6', emoji: '💬', desc: 'Private DM controller walkthrough' }
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📂 Jump to Help Category...')
    .addOptions(
      categories.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setValue(c.value)
          .setDescription(c.desc)
          .setEmoji(c.emoji)
          .setDefault(parseInt(c.value, 10) === currentPage)
      )
    );

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const navRow = buildPaginationButtons({
    currentPage,
    totalPages,
    prefix: 'help_page_'
  });

  return [selectRow, navRow];
}

/**
 * Builds the Volume Setting Modal.
 * @param {number} currentVolume
 * @returns {ModalBuilder}
 */
function createVolumeModal(currentVolume) {
  const modal = new ModalBuilder()
    .setCustomId('modal_set_volume')
    .setTitle('Adjust Playback Volume');

  const volumeInput = new TextInputBuilder()
    .setCustomId('vol_input')
    .setLabel('Enter Volume Level (1% - 200%)')
    .setStyle(TextInputStyle.Short)
    .setValue(String(currentVolume))
    .setPlaceholder('e.g. 100')
    .setMinLength(1)
    .setMaxLength(3)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(volumeInput);
  modal.addComponents(row);

  return modal;
}

module.exports = {
  createMusicControllerRows,
  createQueuePaginationRow,
  createHistoryPaginationRow,
  createHelpPaginationComponents,
  createVolumeModal
};
