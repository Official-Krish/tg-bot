import { splitSecret } from "../services/keyShardingService";

export async function PvtKeyEncryption(privateKey: string) {
    try {
        const { share1String, share2String, share3String } = await splitSecret(privateKey);
        return { share1String, share2String, share3String };
    } catch (error) {
        throw new Error("Error encrypting private key: " + error);
    }
}