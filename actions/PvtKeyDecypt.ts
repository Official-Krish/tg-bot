import bs58 from "bs58";
import { prisma } from "../lib/db";
import { combineSecret } from "../services/keyShardingService";

export async function decodePvtKey(userId: string){
    try {
        const shares = await prisma.user.findFirst({
            where: { telegramId: userId },
            select: {
                pvtKeyShare1: true,
                pvtKeyShare2: true,
                pvtKeyShare3: true,
            },
        });
        if (!shares || !shares.pvtKeyShare1 || !shares.pvtKeyShare2 || !shares.pvtKeyShare3) {
            throw new Error('One or more key shares are missing');
        }
        const share1 = new Uint8Array(Buffer.from(shares.pvtKeyShare1, 'hex'))
        const share2 = new Uint8Array(Buffer.from(shares.pvtKeyShare2, 'hex'))
        const share3 = new Uint8Array(Buffer.from(shares.pvtKeyShare3, 'hex'))

        const res = await combineSecret([
        share1,
        share2,
        share3,
        ])
        const privateKey = bs58.encode(res)
        return privateKey;
    } catch (error) {
        throw new Error("Error decoding private key: " + error);
    }
}