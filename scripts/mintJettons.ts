import { Address, address, toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider, sleep } from '@ton/blueprint';
import * as dotenv from 'dotenv';
dotenv.config();

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const minterAddress = await ui.input('Provide Minter address');
    const jettonAmount = parseInt(process.env.JETTON_SUPPLY!); // max 4288

    const jettonMinter = provider.open(JettonMinter.createFromAddress(address(minterAddress)));

        await jettonMinter.sendMint(provider.sender(), 
            provider.sender().address as Address, // to address
            BigInt(jettonAmount), 
            toNano('0.01'), // forward ton amount
            toNano('0.05') // total ton amount
        );

    ui.write('Minted successfully!');
}