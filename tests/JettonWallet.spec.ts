import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, CommonMessageInfoRelaxed, MessageRelaxed, Message } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import * as dotenv from 'dotenv';
dotenv.config();

// jetton params 

const gas_consumption = toNano('0.015'); //15000000n;
const min_tons_for_storage =  toNano('0.01'); // 10000000n;

describe('JettonWallet', () => {
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;
    let jettonMinterContent: Cell;

    beforeAll(async () => {
        jettonWalletCode = await compile('JettonWallet');
        jettonMinterCode = await compile('JettonMinter');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nonDeployer: SandboxContract<TreasuryContract>;
    let jettonContract: SandboxContract<JettonWallet>;
    let jettonMinter: SandboxContract<JettonMinter>;
    // let jettonWalletContract: SandboxContract<JettonWallet>;
    let minterContractDeployRes: any;
    let jettonContractDeployRes: any;

    let JWalletAddress: Address;
    let nonDeployerJwalletAddr: Address;
    let deployerJettonWallet: SandboxContract<JettonWallet>;
    let nonDeployerJettonWallet: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        nonDeployer = await blockchain.treasury('non-deployer');

        jettonMinterContent = beginCell().endCell();
        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    admin: deployer.address!,
                    content: jettonMinterContent,
                    jwallet_code: jettonWalletCode,
                },
                jettonMinterCode,
            ),
        );
        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });
        // DEPLOYER JETTON WALLET
        JWalletAddress = await jettonMinter.getJettonWalletAddress(deployer.address);
        jettonContract = blockchain.openContract(JettonWallet.createFromAddress(JWalletAddress));
        const deployerJettonBalance = await jettonContract.getJettonBalance();
        expect(deployerJettonBalance).toBe(0n);
        // MINTING JETTONS
        const mintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address, // to Address
            1500n, // jetton amount
            toNano('0.01'), // forward ton amount
            toNano('0.04'), // total ton amount
        );
        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: JWalletAddress, //jettonMinter.address,
            deploy: true,
            success: true,
        });
        // NONDEPLOYER JETTON CONTRACT
        nonDeployerJwalletAddr = await jettonMinter.getJettonWalletAddress(nonDeployer.address);
        // console.log('nonDeployerJWalletAddr ', nonDeployerJwalletAddr);
        nonDeployerJettonWallet = await blockchain.openContract(JettonWallet.createFromAddress(nonDeployerJwalletAddr));
    });
    
    it('should get jetton wallet data after contract has been deployed', async () => {
        const initialJettonBalance = await jettonContract.getJettonBalance();
        // console.log('initialJettonBalance ', initialJettonBalance);
        const jwallet_data = await jettonContract.getJettoWalletData();
        // console.log('jwallet_data', jwallet_data);
        expect(initialJettonBalance).toBe(1500n); //(BigInt(1500));
        expect(jwallet_data.owner_address).toEqualAddress(deployer.address);
        expect(jwallet_data.minter_address).toEqualAddress(jettonMinter.address);
        expect(jwallet_data.jwallet_code).toEqualCell(jettonWalletCode);
    });

    it('wallet owner should be able to send jettons', async () => {
        const sendResult = await jettonContract.sendTransfer(
            deployer.getSender(),
            toNano('0.1'),
            BigInt(100), // jetton_amount toNano('0.0000005'),
            nonDeployer.address, // to Address
            deployer.address,
            beginCell().endCell(), // custom payload
            toNano('0'), // forward ton amount
            beginCell().endCell(), // forward payload
        );
        expect(sendResult.transactions).toHaveTransaction({
            to: JWalletAddress, //deployerJettonWallet.address,
            op: 0xf8a7ea5,
            from: deployer.address,
            success: true,
        });
        let newDeployerJettonBalance = await jettonContract.getJettonBalance();
        // console.log('newdeployerJettonBalance ', newdeployerJettonBalance);
        expect(newDeployerJettonBalance).toBe(1500n - BigInt(100));
        const nonDeployerJWalletBalance = await nonDeployerJettonWallet.getJettonBalance();
        expect(nonDeployerJWalletBalance).toBe(100n);
    });

    it('not owner should not be able to send jettons', async () => {
        nonDeployerJwalletAddr = await jettonMinter.getJettonWalletAddress(nonDeployer.address);
        const sendResult = await jettonContract.sendTransfer(
            nonDeployer.getSender(),
            toNano('0.1'),
            BigInt(100), // jetton_amount toNano('0.0000005'),
            nonDeployer.address,
            deployer.address,
            beginCell().endCell(), // custom payload
            toNano('0'), // forward ton amount
            beginCell().endCell(),
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: nonDeployer.address,
            // to: nonDeployerJwalletAddr,
            op: 0xf8a7ea5,
            success: false,
            exitCode: 705,
        });
    });

    it('impossible to send too much jettons', async () => {
        const initialJettonBalance = await jettonContract.getJettonBalance();
        const sendResult = await jettonContract.sendTransfer(
            deployer.getSender(),
            toNano('0.1'),
            initialJettonBalance + 50n, // jetton_amount toNano('0.0000005'),
            nonDeployer.address, // to Address
            deployer.address, // response address
            beginCell().endCell(), // custom payload
            toNano('0'), // forward ton amount
            beginCell().endCell(),
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonContract.address,
            op: 0xf8a7ea5, //Op.transfer,
            success: false,
            exitCode: 706,
        });
    });

    // it('malformed forward payload', async () => {
    // TODO blockchain.sendMessage(>?)
    // })

    it('should send well-formed forward_payload', async () => {
        let jettonAmount = BigInt(511);
        let forwardAmount = toNano('0.05');
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        let customPayload = beginCell().endCell();
        console.log('nonDeployerJettonWallet.address', nonDeployerJettonWallet.address);
        const jettonWalletBalance = await jettonContract.getJettonBalance();
        const nonDeployerJWalletBalance = await nonDeployerJettonWallet.getJettonBalance();
        const sendResult = await jettonContract.sendTransfer(
            deployer.getSender(),
            toNano('0.1'), //tons
            jettonAmount,
            nonDeployer.address,
            deployer.address,
            customPayload,
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            //excesses
            from: nonDeployerJettonWallet.address,
            to: deployer.address,
            op: 0xd53276db, // Op.excesses
        });
        expect(sendResult.transactions).toHaveTransaction({
            value: forwardAmount,
            from: nonDeployerJettonWallet.address,
            to: nonDeployer.address,
            body: beginCell()
                .storeUint(0x7362d09c, 32) // op::transfer-notificqtion
                .storeUint(0, 64) //default queryId
                .storeCoins(jettonAmount)
                .storeAddress(deployer.address)
                .storeUint(1, 1)
                .storeRef(forwardPayload)
                .endCell(),
        });
        expect(await jettonContract.getJettonBalance()).toEqual(jettonWalletBalance - jettonAmount);
        expect(await nonDeployerJettonWallet.getJettonBalance()).toEqual(nonDeployerJWalletBalance + jettonAmount);
    }); 

    it('should refuse to send forward payload without forward_ton_amount', async () => {
        // const deployerJettonWallet = await userWallet(deployer.address);
        let jettonWalletBalance = await jettonContract.getJettonBalance();
        // const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let nonDeployerJWalletBalance = await nonDeployerJettonWallet.getJettonBalance();
        let sentAmount = 511n;
        let forwardAmount = 0n;
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await jettonContract.sendTransfer(
            deployer.getSender(),
            toNano('0.1'), // msg value (tons)
            sentAmount, // jetton
            nonDeployer.address,
            deployer.address,
            beginCell().endCell(),
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: nonDeployerJettonWallet.address,
            to: deployer.address,
            op: 0xd53276db, // op::excesses
        });
        expect(sendResult.transactions).not.toHaveTransaction({
            value: forwardAmount,
            from: nonDeployerJettonWallet.address,
            to: nonDeployer.address,
        });
        expect(await jettonContract.getJettonBalance()).toEqual(jettonWalletBalance - sentAmount);
        expect(await nonDeployerJettonWallet.getJettonBalance()).toEqual(nonDeployerJWalletBalance + sentAmount);
    });

    it('should revert when forward_ton_amount is more than sent_amount', async () => {
        // const deployerJettonWallet = await userWallet(deployer.address);
        const initialJettonBalance = await jettonContract.getJettonBalance();
        await deployer.send({ value: toNano('1'), bounce: false, to: JWalletAddress });
        const sentAmount = 511n;
        const forwardAmount = toNano('0.3');
        const forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await jettonContract.sendTransfer(
            deployer.getSender(),
            forwardAmount, // not enough tons, no tons for gas
            sentAmount,
            nonDeployer.address,
            deployer.address,
            beginCell().endCell(),
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: JWalletAddress,
            aborted: true,
            exitCode: 709, //error::not_enough_tons
        });

        expect(await jettonContract.getJettonBalance()).toEqual(initialJettonBalance);
    });

    it('should not send forward payload when not enough fees', async () => {
        const initialJettonBalance = await jettonContract.getJettonBalance();
        await deployer.send({value: toNano('1'), bounce: false, to: JWalletAddress});
        const forwardAmount = toNano('0.03');
        const fwd_fee = BigInt(Math.floor(1.5 * 503471)); // fwd_fee is defined by validators , the data is taken from this part of jetton-wallet.fc: `int fwd_fee = muldiv(cs~load_coins(), 3, 2);` 
        const minimalFee = 2n * fwd_fee + 2n * gas_consumption + min_tons_for_storage;
        // fwd_count * fwd_fee + (2 * gas_consumption + min_tons_for_storage));
        const sentAmount = forwardAmount + minimalFee; // not enough - must be > 
        console.log("sentAmount ", sentAmount);
        const forwardPayload = beginCell().endCell();
        const sendResult = await jettonContract.sendTransfer(
            deployer.getSender(),
            sentAmount,
            511n,
            nonDeployerJwalletAddr,
            deployer.address,
            beginCell().endCell(),
            forwardAmount,
            forwardPayload
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonContract.address,
            aborted: true,
            exitCode: 709
        })
    }); 

    it('wallet does not accept internal_transfer not from wallet', async () => {
        // const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await jettonContract.getJettonBalance();
/*
  internal_transfer  query_id:uint64 amount:(VarUInteger 16) from:MsgAddress
                     response_address:MsgAddress
                     forward_ton_amount:(VarUInteger 16)
                     forward_payload:(Either Cell ^Cell)
                     = InternalMsgBody;
*/
        await deployer.send({value: toNano('1'), bounce: false, to: nonDeployer.address});
        let internalTransfer = beginCell().storeUint(0x178d4519, 32).storeUint(0, 64) //default queryId
                              .storeCoins(toNano('0.01'))
                              .storeAddress(deployer.address)
                              .storeAddress(deployer.address)
                              .storeCoins(toNano('0.05'))
                              .storeUint(0, 1)
                  .endCell();
        console.log('nondeployer address ', nonDeployer.address);
        const msg: MessageRelaxed = {info: {type: 'internal', ihrDisabled: true, bounce: true, bounced: false, src: nonDeployer.address, dest: JWalletAddress,  value: {coins: toNano('0.04')}, ihrFee: toNano('0.01'), forwardFee: toNano('0.01'), createdAt: 500, createdLt: 500n},body: internalTransfer};


        const sendResult = await nonDeployer.sendMessages([msg]);
        expect(sendResult.transactions).toHaveTransaction({
            from: nonDeployer.address,
            to: JWalletAddress,
            aborted: true,
            exitCode: 707, //error::unauthorized_incoming_transfer
        });
        expect(await jettonContract.getJettonBalance()).toEqual(initialJettonBalance);
    });
    // TODO:
    // it('should not accept internal_transfer not from wallet', async () => {});
    // it('wallet owner should be able to burn jettons', async () => {});
    // it('not wallet owner should not be able to burn jettons', async () => {});
    // it('wallet owner can not burn more jettons than she has', async () => {});
    // it('minimal burn message fee', async () => {});
    // it('minter should only accept burn messages from jetton wallets', async () => {});
    // TEP 89
    // it('report correctly discovery address', async () => {});
    // it('minimal discovery fee', async () => {});
    // it('correctly handles not valid address in discovery', async () => {});
});
