import { clusterApiUrl, Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";

const  connection  = new  Connection ( clusterApiUrl ( "devnet" ),  "confirmed" );
const bot = new Telegraf(process.env.BOT_TOKEN!);

const USERS: Record<string, Keypair> = {};
interface PendingRequestType {
    type: "SEND_SOL" | "RECEIVE_SOL";
    amount?: number;
    to?: string;
}

const PENDING_REQUESTS: Record<string, PendingRequestType> = {};

const TRANSACTION_HISTORY: Record<string, Array<{ type: string; amount: number; to: string; date: Date }>> = {};

const keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('🔑 Generate Wallet', 'generate_wallet'),
        Markup.button.callback('Show public key', 'show_public_key'),
        Markup.button.callback("Import Wallet", 'import_wallet'),
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
        Markup.button.callback('Export Private Key', 'export_private_key'),
        Markup.button.callback('Transaction History', 'transaction_history'),
    ],
])

try {
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

    bot.action('import_wallet', (ctx) => {
        ctx.reply("Enter your private key (hex format) to import your wallet:", {   
            parse_mode: 'Markdown',
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

    bot.action('export_private_key', (ctx) => {
        ctx.answerCbQuery("Exporting your private key...");
        const userId = ctx.from?.id;
        const keypair = USERS[userId];
        if (!keypair) {
            return ctx.sendMessage("You don't have a wallet yet. Please generate one first.", {
                parse_mode: 'Markdown',
                ...onlyGenerateBoard
            });
        }
        const secretKey = Buffer.from(keypair.secretKey).toString('hex');
        ctx.sendMessage(`Your private key (keep it secret!): \`${secretKey}\``, {
            parse_mode: 'Markdown',
            ...postWalletCreationKeyboard
        });
    });

    bot.action('transaction_history', (ctx) => {
        ctx.answerCbQuery("Fetching your transaction history...");
        const userId = ctx.from?.id;
        const keypair = USERS[userId];
        if (!keypair) {
            return ctx.sendMessage("You don't have a wallet yet. Please generate one first.", {
                parse_mode: 'Markdown',
                ...onlyGenerateBoard
            });
        }
        const history = TRANSACTION_HISTORY[userId];
        if (!history || history.length === 0) {
            return ctx.sendMessage("You have no transaction history.", {
                parse_mode: 'Markdown',
                ...postWalletCreationKeyboard
            });
        }
        let historyMessage = "Your Transaction History:\n\n";
        history.forEach((tx, index) => {
            historyMessage += `${index + 1}. ${tx.type} ${tx.amount} SOL to/from ${tx.to} on ${tx.date.toLocaleString()}\n`;
        });
        ctx.sendMessage(historyMessage, {
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
        if (!userId) return;

        const pendingRequest = PENDING_REQUESTS[userId];
        
        if (pendingRequest && USERS[userId]) {
            if (pendingRequest.type === "SEND_SOL" && !pendingRequest.to) {
                const recipientPubKey = ctx.message.text.trim();
                try {
                    new PublicKey(recipientPubKey);
                    pendingRequest.to = recipientPubKey;
                    ctx.sendMessage("Please enter the amount of SOL to send:", {
                        parse_mode: 'Markdown',
                    });
                    return;
                } catch (error) {
                    return ctx.sendMessage("Invalid public key. Please enter a valid recipient's public key:", {
                        parse_mode: 'Markdown',
                    });
                }
            } else if (pendingRequest.type === "SEND_SOL" && pendingRequest.to && !pendingRequest.amount) {
                const amount = parseFloat(ctx.message.text.trim());
                if (isNaN(amount) || amount <= 0) {
                    return ctx.sendMessage("Invalid amount. Please enter a valid number for the amount of SOL to send:", {
                        parse_mode: 'Markdown',
                    });
                }
                
                try {
                    pendingRequest.amount = amount;
                    const senderBalance = await connection.getBalance(USERS[userId].publicKey) / 1e9;
                    
                    if (senderBalance < (amount + 0.0002)) {
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
                    TRANSACTION_HISTORY[userId] = TRANSACTION_HISTORY[userId] || [];
                    TRANSACTION_HISTORY[userId].push({
                        type: "SEND_SOL",
                        amount,
                        to: pendingRequest.to,
                        date: new Date(),
                    });

                    const recipientId = Object.keys(USERS).find(id => USERS[id]!.publicKey.toBase58() === pendingRequest.to);
                    if (recipientId) {
                        TRANSACTION_HISTORY[recipientId] = TRANSACTION_HISTORY[recipientId] || [];
                        TRANSACTION_HISTORY[recipientId].push({
                            type: "RECEIVE_SOL",
                            amount,
                            to: senderKeypair.publicKey.toBase58(),
                            date: new Date(),
                        });
                    }
                    
                    ctx.sendMessage(`Successfully sent ${amount} SOL to ${pendingRequest.to}!`, {
                        parse_mode: 'Markdown',
                        ...postWalletCreationKeyboard
                    });
                    return;
                    
                } catch (error) {
                    console.error("Transaction error:", error);
                    delete PENDING_REQUESTS[userId];
                    return ctx.sendMessage("Transaction failed. Please try again.", {
                        parse_mode: 'Markdown',
                        ...postWalletCreationKeyboard
                    });
                }
            }
        }
        
        if (!USERS[userId]) {
            const privateKeyHex = ctx.message.text.trim();
            try {
                const secretKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
                const keypair = Keypair.fromSecretKey(secretKey);
                USERS[userId] = keypair;
                ctx.sendMessage(`Wallet imported successfully! Your public key is: ${keypair.publicKey.toBase58()}`, {
                    parse_mode: 'Markdown',
                    ...postWalletCreationKeyboard
                });
            } catch (error) {
                ctx.sendMessage("Invalid private key format. Please ensure it's in hex format and try again.", {
                    parse_mode: 'Markdown',
                });
            }
        }
    });
}catch (error) {
    console.error(error);
}

await bot.launch();