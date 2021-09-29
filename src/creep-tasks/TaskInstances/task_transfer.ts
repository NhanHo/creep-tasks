import { Task } from '../Task';
import { EnergyStructure, isEnergyStructure, isStoreStructure, StoreStructure } from '../utilities/helpers';

export type transferTargetType =
	StructureContainer
	| StructureExtension
	| StructureFactory
	| StructureSpawn
	| StructureTerminal
	| StructureTower
	| StructureLab
	| StructureNuker
	| StructurePowerSpawn
	| Creep;

export class TaskTransfer extends Task {

	static taskName = 'transfer';

	// @ts-ignore
	target: transferTargetType;
	data: {
		resourceType: ResourceConstant
		amount: number | undefined
	};

	constructor(target: transferTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount: number | undefined = undefined,
		options = {} as TaskOptions) {
		super(TaskTransfer.taskName, target, options);
		// Settings
		this.settings.oneShot = true;
		this.data.resourceType = resourceType;
		this.data.amount = amount;
	}

	isValidTask() {
		let amount = this.data.amount || 1;
		let resourcesInCarry = this.creep.carry[this.data.resourceType] || 0;
		return resourcesInCarry >= amount;
	}

	isValidTarget() {
		let amount = this.data.amount || 1;
		return this.target.store.getFreeCapacity(this.data.resourceType) >= amount;
	}

	work() {
		return this.creep.transfer(this.target, this.data.resourceType, this.data.amount);
	}
}
