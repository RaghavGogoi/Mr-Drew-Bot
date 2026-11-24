const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

/**
 * Extracts the target page number from a pagination button custom_id.
 * Works with both:
 * - Prefix with action and page: 'help_page_next_3', 'queue_page_first_1'
 * - Legacy format: 'queue_page_3'
 *
 * @param {string} customId
 * @returns {number}
 */
function extractPageFromCustomId(customId) {
  if (!customId) return 1;
  const parts = customId.split('_');
  const lastPart = parts[parts.length - 1];
  const page = parseInt(lastPart, 10);
  return isNaN(page) ? 1 : page;
}

/**
 * Builds a standardized 5-button pagination row with guaranteed unique custom_ids:
 * [⏮️ First] [◀️ Prev] [📄 Page X / Y] [Next ▶️] [⏭️ Last]
 *
 * @param {object} options
 * @param {number} options.currentPage - 1-based current page
 * @param {number} options.totalPages - Total available pages (>= 1)
 * @param {string} options.prefix - Prefix for customId (e.g. 'queue_page_')
 * @param {boolean} [options.disabled=false] - Whether to disable all buttons
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
function buildPaginationButtons({
  currentPage,
  totalPages,
  prefix = 'page_',
  disabled = false
}) {
  const safeTotal = Math.max(1, totalPages || 1);
  const page = Math.max(1, Math.min(currentPage || 1, safeTotal));
  const isFirst = page <= 1;
  const isLast = page >= safeTotal;

  const prevTarget = Math.max(1, page - 1);
  const nextTarget = Math.min(safeTotal, page + 1);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}first_1`)
      .setLabel('First')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || isFirst),

    new ButtonBuilder()
      .setCustomId(`${prefix}prev_${prevTarget}`)
      .setLabel('Prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || isFirst),

    new ButtonBuilder()
      .setCustomId(`${prefix}indicator`)
      .setLabel(`Page ${page} / ${safeTotal}`)
      .setEmoji('📄')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId(`${prefix}next_${nextTarget}`)
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || isLast),

    new ButtonBuilder()
      .setCustomId(`${prefix}last_${safeTotal}`)
      .setLabel('Last')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || isLast)
  );
}

/**
 * Calculates pagination slice indexes and bounds metadata.
 *
 * @param {number} totalItems
 * @param {number} requestedPage
 * @param {number} [itemsPerPage=10]
 * @returns {{
 *   totalPages: number,
 *   currentPage: number,
 *   startIndex: number,
 *   endIndex: number,
 *   itemsOnPage: number,
 *   hasPrev: boolean,
 *   hasNext: boolean
 * }}
 */
function getPaginationMeta(totalItems, requestedPage = 1, itemsPerPage = 10) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const itemsOnPage = Math.max(0, endIndex - startIndex);

  return {
    totalPages,
    currentPage,
    startIndex,
    endIndex,
    itemsOnPage,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages
  };
}

/**
 * Interactive message collector paginator for commands that generate dynamic pages.
 *
 * @param {object} options
 * @param {import('discord.js').ChatInputCommandInteraction} options.interaction
 * @param {Array<import('discord.js').EmbedBuilder>|Function} options.pages - Array of Embeds or function (pageIndex) => EmbedBuilder
 * @param {number} [options.initialPage=1] - 1-based initial page
 * @param {number} [options.timeout=120000] - Collector timeout in milliseconds
 * @param {Array<ActionRowBuilder>} [options.extraRows=[]] - Optional additional action rows
 * @param {string} [options.prefix='dyn_page_'] - Custom ID prefix
 * @returns {Promise<import('discord.js').Message>}
 */
async function paginateEmbed({
  interaction,
  pages,
  initialPage = 1,
  timeout = 120000,
  extraRows = [],
  prefix = 'dyn_page_'
}) {
  const isFunction = typeof pages === 'function';
  const totalPages = isFunction ? pages.totalPages || 1 : pages.length;

  let currentPage = Math.max(1, Math.min(initialPage, totalPages));

  const getEmbed = (p) => (isFunction ? pages(p) : pages[p - 1]);

  const navRow = buildPaginationButtons({
    currentPage,
    totalPages,
    prefix,
    disabled: totalPages <= 1
  });

  const components = totalPages > 1 ? [navRow, ...extraRows] : [...extraRows];

  let message;
  const payload = { embeds: [getEmbed(currentPage)], components };

  if (interaction.deferred || interaction.replied) {
    message = await interaction.editReply(payload);
  } else {
    message = await interaction.reply({ ...payload, fetchReply: true });
  }

  if (totalPages <= 1) return message;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeout,
    filter: (i) => i.user.id === interaction.user.id
  });

  collector.on('collect', async (i) => {
    if (!i.customId.startsWith(prefix)) return;

    if (i.customId.includes('indicator')) {
      return i.deferUpdate();
    }

    const nextPage = extractPageFromCustomId(i.customId);
    currentPage = Math.max(1, Math.min(nextPage, totalPages));

    const updatedRow = buildPaginationButtons({
      currentPage,
      totalPages,
      prefix
    });

    await i.update({
      embeds: [getEmbed(currentPage)],
      components: [updatedRow, ...extraRows]
    }).catch(() => {});
  });

  collector.on('end', async () => {
    const disabledRow = buildPaginationButtons({
      currentPage,
      totalPages,
      prefix,
      disabled: true
    });
    await message.edit({
      components: [disabledRow, ...extraRows]
    }).catch(() => {});
  });

  return message;
}

module.exports = {
  extractPageFromCustomId,
  buildPaginationButtons,
  getPaginationMeta,
  paginateEmbed
};
