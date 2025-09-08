import { clusterApiUrl, Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";

const  connection  = new  Connection ( clusterApiUrl ( "devnet" ),  "confirmed" );
const bot = new Telegraf(process.env.BOT_TOKEN!);

const USERS: Record<string, Keypair> = {};
interface PendingRequestType {
    type: "SEND_SOL" | "SEND_TOKEN";
    amount?: number;
    to?: string;
}

const PENDING_REQUESTS: Record<string, PendingRequestType> = {};

const keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('🔑 Generate Wallet', 'generate_wallet'),
        Markup.button.callback('Show public key', 'show_public_key'),
    ],
])

const onlyGenerateBoard = Markup.inlineKeyboard([
    [
        Markup.button.callback('🔑 Generate Wallet', 'generate_wallet'),
    ],
])

const postWalletCreationKeyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('Send SOL', 'send_sol'),
        Markup.button.callback('Show public key', 'show_public_key'),
        Markup.button.callback('Show Balance', 'show_balance'),
    ],
])

bot.start((ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    let welcomeMessage = 'Welcome to the Solana Wallet Bot!\n\n';

    return ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboard
    })
});

bot.action('generate_wallet', async (ctx) => {
    ctx.answerCbQuery("Generating your wallet...");
    const keypair = Keypair.generate();
    const userId = ctx.from?.id;
    USERS[userId] = keypair;
    ctx.sendMessage(`New wallet generated successfully for you with public key: ${keypair.publicKey.toBase58()}`, {
        parse_mode: 'Markdown',
        ...postWalletCreationKeyboard
    });
});

bot.action('show_public_key', (ctx) => {
    ctx.answerCbQuery("Fetching your public key...");
    const userId = ctx.from?.id;
    const keypair = USERS[userId];
    if (!keypair) {
        return ctx.sendMessage("You don't have a wallet yet. Please generate one first.", {
            parse_mode: 'Markdown',
            ...onlyGenerateBoard
        });
    }
    ctx.sendMessage(`Your public key is: ${keypair.publicKey.toBase58()}`, {
        parse_mode: 'Markdown',
        ...postWalletCreationKeyboard
    });
});

bot.action('show_balance', async (ctx) => {
    ctx.answerCbQuery("Fetching your balance...");
    const userId = ctx.from?.id;
    const keypair = USERS[userId];
    if (!keypair) {
        return ctx.sendMessage("You don't have a wallet yet. Please generate one first.", {
            parse_mode: 'Markdown',
            ...onlyGenerateBoard
        });
    }
    const balance = await connection.getBalance(keypair.publicKey);
    ctx.sendMessage(`Your wallet balance is: ${balance / 1e9} SOL`, {
        parse_mode: 'Markdown',
        ...postWalletCreationKeyboard
    });
});

bot.action('send_sol', (ctx) => {
    const userId = ctx.from?.id;
    ctx.answerCbQuery();
    ctx.sendMessage("Please enter the recipient's public key:", {
        parse_mode: 'Markdown',
    });
    PENDING_REQUESTS[userId] = { type: "SEND_SOL" };
});

bot.on(message("text"), async (ctx) => {
    const userId = ctx.from?.id;
    if (!USERS[userId]) {
        return ctx.sendMessage("You don't have a wallet yet. Please generate one first.", {
            parse_mode: 'Markdown',
            ...onlyGenerateBoard
        });
    }
    const pendingRequest = PENDING_REQUESTS[userId];
    if (!pendingRequest) return;

    if (pendingRequest.type === "SEND_SOL" && !pendingRequest.to) {
        const recipientPubKey = ctx.message.text;
        if (connection.getAccountInfo(new PublicKey(recipientPubKey)) === null) {
            return ctx.sendMessage("Invalid public key. Please enter a valid recipient's public key:", {
                parse_mode: 'Markdown',
            });
        }
        pendingRequest.to = recipientPubKey;
        ctx.sendMessage("Please enter the amount of SOL to send:", {
            parse_mode: 'Markdown',
        });
    } else if (pendingRequest.type === "SEND_SOL" && pendingRequest.to && !pendingRequest.amount) {
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.sendMessage("Invalid amount. Please enter a valid number for the amount of SOL to send:", {
                parse_mode: 'Markdown',
            });
        }
        pendingRequest.amount = amount;
        const senderBalance = await connection.getBalance(USERS[userId].publicKey) / 1e9;
        if (senderBalance < amount) {
            delete PENDING_REQUESTS[userId];
            return ctx.sendMessage(`Insufficient balance. Your current balance is ${senderBalance} SOL. Transaction cancelled.`, {
                parse_mode: 'Markdown',
                ...postWalletCreationKeyboard
            });
        }
        
        const recipientPubKey = new PublicKey(pendingRequest.to);
        const senderKeypair = USERS[userId];
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: recipientPubKey,
            lamports: amount * 1e9,
        });
        const transaction = new Transaction().add(transferInstruction);
        transaction.feePayer = senderKeypair.publicKey;
        let { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.sign(senderKeypair);
        await sendAndConfirmTransaction(
            connection,
            transaction,
            [senderKeypair]
        );

        delete PENDING_REQUESTS[userId];
        ctx.sendMessage(`Successfully sent ${amount} SOL to ${pendingRequest.to}!`, {
            parse_mode: 'Markdown',
            ...postWalletCreationKeyboard
        });
    }
});

await bot.launch();