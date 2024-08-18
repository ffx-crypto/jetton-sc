import { toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import { compile, NetworkProvider } from '@ton/blueprint';
import * as dotenv from 'dotenv';
import { jettonContentToCell } from '../wrappers/JettonMinter';
dotenv.config();

export async function run(provider: NetworkProvider) {
    const contentUrl = process.env.CONTENT_URL!;
    const wallet_code = await compile('JettonWallet');
    const minter_code = await compile('JettonMinter');
    const minter_content = jettonContentToCell({type:1,uri:contentUrl});

    const masterContract = provider.open(JettonMinter.createFromConfig({
        admin: provider.sender().address!,
        content: minter_content,
        jwallet_code: wallet_code
    }, minter_code));

    await masterContract.sendDeploy(provider.sender(), toNano('0.1'));

    await provider.waitForDeploy(masterContract.address);

    // run methods on `masterContract`
}
