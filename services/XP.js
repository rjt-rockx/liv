const BaseService = require("../src/base/baseService.js");

module.exports = class XP extends BaseService {
	constructor(client) {
		super(client, {
			name: "XP Service",
			description: "Manage XP data for each guild.",
			enabled: true,
			guildOnly: true
		});
		this.guilds = {};
		this.defaultXpOptions = {
			messageConsidered: "first",
			minuteInterval: 1,
			maxCharCount: 256,
			multiplier: 1,
			enabled: false
		};
	}

	getOrInitializeGuild(ctx) {
		if (!this.guilds[ctx.guild.id])
			this.guilds[ctx.guild.id] = { xp: {}, counter: 0, guildStorage: ctx.guildStorage };
		return this.updateXpOptions(ctx.guild.id, ctx.guildStorage.get("xpOptions") || ctx.guildStorage.set("xpOptions", {}));
	}

	updateXpOptions(id, xpOptions) {
		this.guilds[id].xpOptions = { ...this.defaultXpOptions };
		for (const key of Object.keys(xpOptions))
			if (typeof this.defaultXpOptions[key] === typeof xpOptions[key])
				this.guilds[id].xpOptions[key] = xpOptions[key];
		return this.guilds[id];
	}

	onMessage(ctx) {
		if (ctx.user.bot || ctx.message.isCommand)
			return;
		const { xp, xpOptions } = this.getOrInitializeGuild(ctx);

		if (!xpOptions.enabled)
			return;

		const sanitizedText = this.sanitizeText(ctx.message.content);
		if (!sanitizedText || !sanitizedText.length)
			return;

		let characterCount = +sanitizedText.split(" ").join("").length;
		if (xpOptions.maxCharCount > 0 && xpOptions.maxCharCount <= 2000)
			characterCount = Math.min(characterCount, xpOptions.maxCharCount);

		if (typeof xp[ctx.user.id] === "number") {
			if (xpOptions.messageConsidered === "longest")
				xp[ctx.user.id] = Math.max(xp[ctx.user.id], characterCount);
			else if (xpOptions.messageConsidered === "average")
				xp[ctx.user.id] = parseInt((xp[ctx.user.id] + characterCount) / 2, 10);
			else if (xpOptions.messageConsidered === "first")
				return;
		}
		else if (typeof xp[ctx.user.id] !== "number")
			xp[ctx.user.id] = characterCount;
	}

	everyMinute() {
		for (const id of Object.keys(this.guilds)) {
			const { xp, guildStorage, xpOptions } = this.guilds[id];
			if (!xpOptions.enabled)
				continue;

			this.guilds[id].counter++;
			if (this.guilds[id].counter !== +xpOptions.minuteInterval)
				continue;

			const multiplier = typeof xpOptions.multiplier === "number" && xpOptions.multiplier > 0 ? xpOptions.multiplier : 1;
			const xpData = guildStorage.get("xp") || guildStorage.set("xp", {});

			for (const [userID, xpToAdd] of Object.entries(xp)) {
				if (typeof xpData[userID] !== "number")
					xpData[userID] = 0;
				xpData[userID] += xpToAdd * multiplier;
			}

			guildStorage.set("xp", xpData);
			this.guilds[id].xp = {};
			this.guilds[id].counter = 0;
		}
	}

	sanitizeText(text) {
		const idRegex = /(?<mention><[@!&#]{1,2}?(?<id>\d{15,25})>|@everyone|@here)/g;
		const customEmojiRegex = /<(?<identifier>:(?<name>.*?):)(?<id>\d*?)>/gmi;
		const regularEmojiRegex = /(:)(?<name>[\w-]*?)(\1)/gmi;
		const formattingRegex = /(?<start>```|`|\*\*|\*|__|_|~~|\|\|)(?<content>.*?)(?<end>\1)/gmi;
		const gapRegex = /(?<gapChar>\s|\n)+/gmi;

		const filteredContent = String(text)
			.replace(idRegex, " ")
			.replace(customEmojiRegex, "#")
			.replace(regularEmojiRegex, "#")
			.replace(gapRegex, "$1");

		if (!filteredContent)
			return;

		let unformattedContent = filteredContent, regexResults = formattingRegex.exec(unformattedContent);
		while (regexResults && regexResults.groups) {
			unformattedContent = unformattedContent.replace(formattingRegex, "$2");
			regexResults = formattingRegex.exec(unformattedContent);
		}

		if (!unformattedContent)
			return;

		return unformattedContent;
	}

	calculateLevel(xp) {
		let level = 0, required = 0;
		let progress = typeof xp === "number" ? xp : 0;
		const total = progress;
		while (required <= progress) {
			++level;
			progress = progress - required;
			required = Math.ceil((level ** 2) / 2) * 100;
		}
		return { level: level - 1, progress, required, total };
	}

	getXPData(guildID, userID = "") {
		const guildStorage = this.client.dataHandler.getGuildStorage(guildID);
		const xpData = guildStorage.get("xp");
		const guildXpData = Object.entries(xpData).sort((a, b) => b[1] - a[1]).reduce((guildXpData, [id, totalXp], index, { length: totalRanks }) => {
			guildXpData[id] = { ...this.calculateLevel(totalXp), rank: +index + 1, totalRanks };
			return guildXpData;
		}, {});
		return userID ? guildXpData[userID] : guildXpData;
	}
};