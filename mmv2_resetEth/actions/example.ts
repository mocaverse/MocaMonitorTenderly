import {
	ActionFn,
	Context,
	Event,
	Network,
} from '@tenderly/actions';

import { ethers } from 'ethers';
import axios from 'axios';

import MocaTokenAbi from './MocaTokenAbi.json';
import MocaOftAbi from './MocaOftAbi.json';
import MocaTokenAdapterAbi from './MocaTokenAdapterAbi.json';

const MOCA_TOKEN_ADDRESS = "0xF944e35f95E819E752f3cCB5Faf40957d311e8c5";
const MOCA_TOKEN_ADAPTER_ADDRESS = "0x2B11834Ed1FeAEd4b4b3a86A6F571315E25A884D";
const MOCA_OFT_ADDRESS = "0xF944e35f95E819E752f3cCB5Faf40957d311e8c5";

export const tracker: ActionFn = async (context: Context, event: Event) => {
	const gatewayEthereum = context.gateways.getGateway(Network.MAINNET);
	const gatewayPolygon = context.gateways.getGateway(Network.POLYGON);
  	
	// Using the Ethers.js provider class to call the RPC URL
  	const rpcMainnet = new ethers.JsonRpcProvider(gatewayEthereum);
  	const rpcPolygon = new ethers.JsonRpcProvider(gatewayPolygon);

	// Instantiate MocaToken contract
	const mocaTokenContract = new ethers.Contract(MOCA_TOKEN_ADDRESS, MocaTokenAbi, rpcMainnet);

	// Call balanceOf function
	const adapterBalance = await mocaTokenContract.balanceOf(MOCA_TOKEN_ADAPTER_ADDRESS);
	console.log('Adapter Balance:', adapterBalance.toString());

    // Instantiate MocaTokenAdapter + MocaOft contract
		// Obtain the private key from context.secrets.get("oracle.addressPrivateKey")
		const privateKey = await context.secrets.get("monitor.privateKey.Live");
		const signerPolygon = new ethers.Wallet(privateKey, rpcPolygon);
    const mocaOftContract = new ethers.Contract(MOCA_OFT_ADDRESS, MocaOftAbi, signerPolygon);
		
		const signerMainnet = new ethers.Wallet(privateKey, rpcMainnet);
    const mocaTokenAdapterContract = new ethers.Contract(MOCA_TOKEN_ADAPTER_ADDRESS, MocaTokenAdapterAbi, signerMainnet);
	
   
    // Call totalSupply on OFT
    const oftBalance = await mocaOftContract.totalSupply();
    console.log('OFT Balance:', oftBalance.toString());

	if(adapterBalance != oftBalance) {

		const delta = BigInt(adapterBalance.toString()) - BigInt(oftBalance.toString());
		const deltaTokens = parseFloat(delta.toString()) / 1e18; 

		//break bridge
		const message = 
			`TENDERLY_ETH\n

			 Adapter Balance: ${adapterBalance}
			 OFT Balance: ${oftBalance}
			 Delta: ${delta}
			 DeltaTokens: ${deltaTokens}`;

		await notifyTelegram(message, context);

		// trigger sendTransaction function
		const hash = await sendTransaction(context, mocaTokenAdapterContract);
		console.log('Ethereum txn hash:', hash.toString());
		
		const hashMessage = 
			`TENDERLY_ETH\n
		resetPeer() called successfully on Ethereum.
		https://etherscan.io/tx/${hash.toString()}\n`;
		
		await notifyTelegram(hashMessage, context);

	} else {

		await notifyTelegram('Tenderly_Eth\n Balances are equal: LIVE TEST', context);
		console.log('Balances are equal: LIVE TEST');
	}
}

async function sendTransaction(context: Context, mocaTokenAdapterContract: ethers.Contract) {

	// break bridge from ethereum side
	const remoteChainID = 137;		// polygon chainId
	
	const txn = await mocaTokenAdapterContract.resetPeer(remoteChainID);	
	console.log('Transaction created');

	// wait for block
	const receipt = await txn.wait(1);
	console.log('Transaction receipt:', receipt);

	return receipt.hash;
}

const notifyTelegram = async (text: string, context: Context) => {

    console.log('Sending to Telegram:', text);

	const botToken = await context.secrets.get("MocaMonitorBotToken");
    const chatId = await context.secrets.get("telegram.channelId");

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        await axios.post(apiUrl, {
            chat_id: chatId,
            text: text,
        });
        console.log('Message sent successfully to Telegram');

    } catch (error) {

        console.error('Error sending message to Telegram:', error);
    }
};
