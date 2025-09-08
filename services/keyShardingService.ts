import base58 from 'bs58'
import {
  split as shamirSplit,
  combine as shamirCombine,
} from 'shamir-secret-sharing'


export async function splitSecret(privateKey: string) {
    if (!privateKey) {
        throw new Error('Private key is undefined')
    }
    try {
        const secretKeyUint8Array = new Uint8Array(base58.decode(privateKey))

        const rawShares = await shamirSplit(secretKeyUint8Array, 3, 3) as (Uint8Array | undefined)[]
        if (rawShares.length !== 3 || rawShares.some(s => !s)) {
        throw new Error('Failed to generate required number of shares')
        }

        const [share1, share2, share3] = rawShares as [Uint8Array, Uint8Array, Uint8Array]
        const share1String = Buffer.from(share1).toString('hex')
        const share2String = Buffer.from(share2).toString('hex')
        const share3String = Buffer.from(share3).toString('hex')

        return { share1String, share2String, share3String }
    } catch (error) {
        console.error('Error splitting secret:', error)
        throw error
    }
}

export async function combineSecret(shares: Uint8Array[]) {
    if (!shares || shares.length === 0) {
        throw new Error('Shares are undefined or empty')
    }

    try {
        const secretKey = await shamirCombine(shares)
        return new Uint8Array(secretKey)
    } catch (e) {
        console.error('Error while combining shares: ', e)
        throw e
    }
}