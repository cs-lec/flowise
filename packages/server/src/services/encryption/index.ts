import { randomBytes } from 'crypto'
import { AES, enc } from 'crypto-js'
import { getEncryptionKeyPath } from 'flowise-components'
import fs from 'fs'
import { StatusCodes } from 'http-status-codes'
import { Credential } from '../../database/entities/Credential'
import { Encryption } from '../../database/entities/Encryption'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { ICredentialDataDecrypted } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import credentials from '../credentials'
import encryptionCredential from '../encryptionCredential'

/**
 * It generate encryption key into database then match with existing available credentials.
 *
 * @returns void
 *
 * @remarks This will call `generate` and `resync` function.
 */
const init = async () => {
    try {
        // Step 1 - Create encryption in database's encryption table
        await generate()

        // Step 2 - Resync encryption and encryption in database's encryption_credential table
        await resync()
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.init - ${getErrorMessage(error)}`)
    }
}

/**
 * It will try match existing encryption keys and credentials to the correct one.
 *
 * @returns void
 *
 */
const resync = async (): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()

        // step 1 - get all encryption and credential
        const allEncryption: Encryption[] = await appServer.AppDataSource.getRepository(Encryption).find()
        const allCredential: Credential[] = await appServer.AppDataSource.getRepository(Credential).find()

        // step 2 - loop credential then loop each encryption to find the correct 1 to perform insert/update into encryption_credential table
        for (const credential of allCredential) {
            for (const encryption of allEncryption) {
                let decrypted = true
                try {
                    // step 3 - try decrypt credential with encryptionKey
                    await decrypt(credential, encryption)
                } catch (error) {
                    decrypted = false
                }
                if (decrypted) {
                    // step 4a - get all rows in encryptCrednetial table for a specific credentialId
                    const dbResponse = await encryptionCredential.findByCredentialId(credential.id)

                    if (dbResponse.length == 0) {
                        // step 4b - insert new encryption credential row when credentialId is not found
                        await encryptionCredential.create(encryption.id, credential.id)
                    } else if (dbResponse.length == 1) {
                        // step 4b - update existing encryption credential rows when credentialId is found
                        await encryptionCredential.updateEncryptionId(encryption.id, credential.id)
                    }
                    // step 4c - update credential isEncryptionKeyLost to false
                    await credentials.updateIsEncryptionKeyLost(credential.id, false)

                    // step 4d - go to next credential because already found the correct encryption
                    break
                } else {
                    // step 4a - update credential isEncryptionKeyLost to true
                    await credentials.updateIsEncryptionKeyLost(credential.id, true)

                    // step 4b - delete relationship of encryptioncredential that are not relatvant anymore
                    await encryptionCredential.deleteByEncryptionId(encryption.id, credential.id)
                }
            }
        }
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.resync - ${getErrorMessage(error)}`)
    }
}

/**
 * Generate an encryption key
 * @returns {string}
 */
const generate = async (): Promise<Encryption> => {
    try {
        const appServer = getRunningExpressApp()

        // step 1 - get value of FLOWISE_SECRETKEY_OVERWRITE
        let SECRETKEY_OVERWRITE: string = ''
        if (process.env.FLOWISE_SECRETKEY_OVERWRITE !== undefined && process.env.FLOWISE_SECRETKEY_OVERWRITE !== '')
            SECRETKEY_OVERWRITE = process.env.FLOWISE_SECRETKEY_OVERWRITE

        // step 2 - get value of SECRETKEY_FROM_PATH if exists
        let SECRETKEY_FROM_PATH: string = ''
        try {
            SECRETKEY_FROM_PATH = await fs.promises.readFile(getEncryptionKeyPath(), 'utf8')
        } catch (error) {
            // bypass error if not found, there's no need to create this file anymore
        }

        // step 3 - get all encryptionKey values from database
        let dbFindResponse = await appServer.AppDataSource.getRepository(Encryption).find({ select: { encryptionKey: true } })
        const encryptionKeys = dbFindResponse.map((response) => {
            return response.encryptionKey
        })

        // step 4 - insert SECRETKEY into database if not duplicate
        let nameCounter: number = encryptionKeys.length
        const insertLegacyEncryption = async (SECRETKEY: string) => {
            if (SECRETKEY != '' && !encryptionKeys.includes(SECRETKEY)) {
                nameCounter += 1
                const newEncryption: Partial<Encryption> = { name: nameCounter.toString(), encryptionKey: SECRETKEY }
                await create(newEncryption)
            }
        }
        await insertLegacyEncryption(SECRETKEY_FROM_PATH)
        await insertLegacyEncryption(SECRETKEY_OVERWRITE)

        // step 5 - return value based on latest updated date
        try {
            return await get()
        } catch (error) {
            // bypass error if no encryptionKey found in database
        }

        // step 6 - will reach when there are no encryptionKey value created in SECRETKEY_OVERWRITE, SECRETKEY_FROM_PATH and encryption table in database
        nameCounter += 1
        const newEncryption: Partial<Encryption> = { name: nameCounter.toString() }
        return await create(newEncryption)
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.generate - ${getErrorMessage(error)}`)
    }
}

/**
 * Return new encryption
 * @param {Partial<Encryption>} credential
 * @returns {Promise<Encryption>}
 */
const create = async (encryption: Partial<Encryption>): Promise<Encryption> => {
    try {
        const appServer = getRunningExpressApp()

        // step 1 - check whether encryption key is undefined, if yes generate new key
        if (!encryption.encryptionKey) encryption.encryptionKey = randomBytes(24).toString('base64')

        // step 2 - check whether encryption name is undefined, if yes throw error
        if (!encryption.name) throw new Error('Please provide a name for this encryption.')

        // step 3 - save into database's encryption table
        const newEncryption = await appServer.AppDataSource.getRepository(Encryption).create(encryption)
        await appServer.AppDataSource.getRepository(Encryption).save(newEncryption)

        // step 4 - return new encryption
        return newEncryption
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.create - ${getErrorMessage(error)}`)
    }
}

/**
 * If `credential` is provided it will return `corresponding encryption` else it will return `latest encryption`.
 *
 * @param credential - Credential entity
 * @returns {Promise<Encryption>}
 *
 */
const get = async (credential?: Credential): Promise<Encryption> => {
    try {
        const appServer = getRunningExpressApp()

        // step 1 - check whether credential is pass into this function
        if (!credential) {
            // step 2 - return latest encryption based on updatedDate descending
            const dbResponse = await appServer.AppDataSource.getRepository(Encryption).find({
                select: { id: true, encryptionKey: true },
                order: { updatedDate: 'DESC' }
            })

            // step 2a - return the first encryption key
            if (dbResponse.length != 0) return dbResponse[0]
            // step 2b - throw error when there are no encryption key available
            else throw new Error('No encryption key available')
        }

        // step 2 - find corresponding encryptions for a specific credential id
        const credentialId: string = credential.id
        const dbResponse: Encryption[] = await appServer.AppDataSource.getRepository(Encryption)
            .createQueryBuilder('e')
            .leftJoinAndSelect('encryption_credential', 'ec', 'ec.encryptionId = e.id')
            .leftJoinAndSelect('credential', 'c', 'ec.credentialId = c.id')
            .where('c.id = :credentialId', { credentialId })
            .getMany()

        // step 2a - return the first encryption key
        if (dbResponse.length == 1) return dbResponse[0]
        // step 2b - throw error when crendential have multiple encryptions
        else if (dbResponse.length > 1) throw new Error(`credentialId: ${credential.id} have multiple encryptions`)
        // step 2c - throw error when credential do not have
        throw new Error(`credentialId: ${credential.id}'s encryption is lost`)
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.get - ${getErrorMessage(error)}`)
    }
}

/**
 * Encrypt encrypted data.
 *
 * @param plainDataObj - ICredentialDataDecrypted interface
 * @returns `{ encryption: Encryption; encryptedData: string }`
 *
 * @remarks Returned `encryption` is the encryption used during encryption
 */
const encrypt = async (plainDataObj: ICredentialDataDecrypted): Promise<{ encryption: Encryption; encryptedData: string }> => {
    try {
        // step 1 - always get the latest encryption key
        const encryption: Encryption = await get()

        // step 2 - encrypt plainDataObj
        const encryptedData: string = AES.encrypt(JSON.stringify(plainDataObj), encryption.encryptionKey).toString()

        return { encryption, encryptedData }
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.encrypt - ${getErrorMessage(error)}`)
    }
}

/**
 * Decrypt encrypted data.
 *
 * @param credential - Credential entity
 * @param encryptionKey - Encryption entity
 * @returns `{ encryption: Encryption; plainDataObj: ICredentialDataDecrypted }`
 *
 * @remarks Returned `encryption` is the encryption used during decryption
 */
const decrypt = async (
    credential: Credential,
    encryption?: Encryption
): Promise<{ encryption: Encryption; plainDataObj: ICredentialDataDecrypted }> => {
    try {
        // step 1 - find correct encryption if not provided
        if (!encryption) encryption = await get(credential)

        // step 2 - decrypt encryptedData with encryption available
        const plainDataObj = JSON.parse(AES.decrypt(credential.encryptedData, encryption.encryptionKey).toString(enc.Utf8))

        return { encryption, plainDataObj }
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: encryptionService.decrypt - ${getErrorMessage(error)}`)
    }
}

export default {
    create,
    decrypt,
    encrypt,
    get,
    init,
    resync // reason to export resync is because user can resync when they found encryption and credential does not match
}
