const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;

// 👇 apne role IDs daal
const OWNER_ROLE = "1458116518167445549";
const FINANCE_ROLE = "1464972301195022426";
const BANK_ROLE = "1464972413363032165";

let db = { users: {} };

// Load DB
if (fs.existsSync("./database.json")) {
  db = JSON.parse(fs.readFileSync("./database.json"));
}

// Save DB
function saveDB() {
  fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));
}

// Role check
function hasAccess(member) {
  return member.roles.cache.has(OWNER_ROLE) ||
         member.roles.cache.has(FINANCE_ROLE) ||
         member.roles.cache.has(BANK_ROLE);
}

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// 🔁 Auto transfer checker (restart safe)
setInterval(() => {
  const now = Date.now();

  for (let id in db.users) {
    let user = db.users[id];

    if (user.holdingData) {
      user.holdingData = user.holdingData.filter(item => {
        if (now >= item.time) {
          user.bank += item.amount;
          user.holding -= item.amount;
          return false;
        }
        return true;
      });
    }
  }

  saveDB();
}, 60000);

// Commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

  // 💰 MONEY ADD
  if (name === "money") {
    if (!hasAccess(interaction.member)) {
      return interaction.reply({ content: "❌ No permission", ephemeral: true });
    }

    const user = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    if (!db.users[user.id]) {
      db.users[user.id] = { bank: 0, holding: 0, holdingData: [] };
    }

    db.users[user.id].holding += amount;

    db.users[user.id].holdingData.push({
      amount,
      time: Date.now() + (2 * 60 * 60 * 1000)
    });

    saveDB();

    interaction.reply(`💰 ${amount} BIGPAY added to holding of ${user.username}`);
  }

  // 🏦 BALANCE
  if (name === "balance") {
    const user = interaction.user;

    if (!db.users[user.id]) {
      db.users[user.id] = { bank: 0, holding: 0, holdingData: [] };
    }

    interaction.reply(`🏦 Bank: ${db.users[user.id].bank}\n⏳ Holding: ${db.users[user.id].holding}`);
  }

  // 💳 WITHDRAW
  if (name === "withdraw") {
    const amount = interaction.options.getInteger("amount");
    const user = interaction.user;

    if (!db.users[user.id] || db.users[user.id].bank < amount) {
      return interaction.reply("❌ Not enough balance");
    }

    const channel = await interaction.guild.channels.create({
      name: `withdraw-${user.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: user.id,
          allow: [PermissionsBitField.Flags.ViewChannel]
        }
      ]
    });

    db.users[user.id].pending = amount;
    saveDB();

    channel.send(`💳 Withdraw Request\nUser: <@${user.id}>\nAmount: ${amount} BIGPAY`);
    interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // ❌ CLOSE
  if (name === "close") {
    const channel = interaction.channel;
    const userId = channel.name.split("-")[1];

    if (!db.users[userId]) {
      return interaction.reply("❌ User not found");
    }

    const amount = db.users[userId].pending || 0;

    db.users[userId].bank -= amount;
    db.users[userId].pending = 0;

    saveDB();

    await interaction.reply("✅ Done, closing ticket...");
    setTimeout(() => channel.delete(), 3000);
  }
});

client.login(TOKEN);
