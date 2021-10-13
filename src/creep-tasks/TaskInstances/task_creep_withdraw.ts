/* This is the withdrawal task for non-energy resources. */

import { Task } from "../Task";
import { EnergyStructure, isEnergyStructure, isStoreStructure, StoreStructure } from "../utilities/helpers";

export type creepWithdrawTargetType = Creep;

export class TaskCreepWithdraw extends Task {
	public static taskName = "creep_withdraw";

	// @ts-ignore
	target: creepWithdrawTargetType;

	constructor(
		target: creepWithdrawTargetType,
		resourceType: ResourceConstant = RESOURCE_ENERGY,
		amount: number | undefined = undefined,
		options = {} as TaskOptions
	) {
		super(TaskCreepWithdraw.taskName, target, options);
		// Settings
		this.settings.oneShot = true;
		this.data.resourceType = resourceType;
		this.data.amount = amount;
	}

	public isValidTask() {
		const amount = this.data.amount || 1;
		return _.sum(this.creep.carry as any) <= this.creep.carryCapacity - amount;
	}

	public isValidTarget() {
		const amount = this.data.amount || 1;
		const target = this.target as Creep;
		return (target.carry[this.data.resourceType] || 0) >= amount;
	}

	public work() {
		return this.target.transfer(this.creep, this.data.resourceType as ResourceConstant,
			this.data.amount);
	}
}
