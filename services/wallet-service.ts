import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { prisma } from "../lib/db";
import { PvtKeyEncryption } from "../actions/PvtKeyMngmt";
import { clusterApiUrl, Connection, sendAndConfirmTransaction } from "@solana/web3.js";
import { decodePvtKey } from "../actions/PvtKeyDecypt";
import bs58 from "bs58";

const  connection  = new  Connection ( clusterApiUrl ( "devnet" ),  "confirmed" );

interface User {
    id: string;
    telegramId: string;
    publicKey: string;
    pvtKeyShare1: string;
    pvtKeyShare2: string;
    pvtKeyShare3: string;
}

export async function generateKeypair(userId: string, pvtkey?: string) {
    try{
        const keypair = Keypair.generate();
        const { share1String, share2String, share3String } = await PvtKeyEncryption(pvtkey ? pvtkey : bs58.encode(keypair.secretKey));
        const user = await prisma.user.create({
            data: {
                telegramId: userId,
                publicKey: keypair.publicKey.toBase58(),
                pvtKeyShare1: share1String,
                pvtKeyShare2: share2String,
                pvtKeyShare3: share3String,
            },
        });
        return user;
    } catch (error) {
        console.error("Error generating keypair: " + error);
    }
};

export async function getUserByTelegramId(telegramId: string) {
    try {
        const user = await prisma.user.findFirst({
            where: {
                telegramId: telegramId,
            },
        });
        if (user) {
            return user;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching user: " + error);
    }
}

export async function sendSol(toPublicKey: string, user: User, amount: number) {
    try{
        const pvtKey = await decodePvtKey(user.telegramId);
        const senderKeypair = Keypair.fromSecretKey(new Uint8Array(Buffer.from(pvtKey, 'hex')));

        const transferInstruction = SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: new PublicKey(toPublicKey),
            lamports: amount * 1e9,
        });
        
        const transaction = new Transaction().add(transferInstruction);
        transaction.feePayer = senderKeypair.publicKey;
        let { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.sign(senderKeypair);
        
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [senderKeypair]
        );

        await prisma.transaction.create({
            data: {
                userId: user.id,
                to: toPublicKey,
                amount: amount,
                type: 'send',
                signature: signature,
                date: new Date(),
            },
        });
    } catch (error) {
        console.error("Error sending SOL: " + error);
    }
}