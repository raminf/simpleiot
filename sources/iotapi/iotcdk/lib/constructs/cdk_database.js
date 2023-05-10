"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKDatabase = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
*/
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const rds = require("aws-cdk-lib/aws-rds");
const common_1 = require("./common");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const aws_rds_1 = require("aws-cdk-lib/aws-rds");
;
class CDKDatabase extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // console.log("Executing: Database stack with prefix: " + namePrefix)
        let bastionSecurityGroupName = props.prefix + "_bastion_ssh_sg";
        let bastionSecurityGroup = new ec2.SecurityGroup(this, "bastion_security_group", {
            vpc: props.vpc,
            securityGroupName: bastionSecurityGroupName,
            allowAllOutbound: true
        });
        // NOTE: we limit access to bastion host to the device this is running on.
        // This means any future access to the bastion host will require being from the same
        // IP address.
        //
        let ipWithCIDR = props.myIp + "/32";
        bastionSecurityGroup.addIngressRule(aws_ec2_1.Peer.ipv4(ipWithCIDR), aws_ec2_1.Port.tcp(22), "Incoming SSH");
        // We can have a custom security group. But the allow_from_any_ipv4() call below
        // does the same thing. So these are commented for now, but provided in case we need
        // to create a custom SG.
        //
        // Allow ingress from SSH - from any host. We can tighten this more to specific hosts
        // if need be.
        //
        // bastion_security_group.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(22), "SSH access")
        //
        // This is a bit too permissive. We're going to need to assign a different security group
        // for allowing rds to contact.
        let bastion_instance_name = props.prefix + "_db_bastion_host";
        this.bastion = new ec2.BastionHostLinux(this, "db_bastion_host", {
            vpc: props.vpc,
            blockDevices: [
                {
                    deviceName: '/dev/xvda',
                    mappingEnabled: true,
                    volume: ec2.BlockDeviceVolume.ebs(20, {
                        deleteOnTermination: true,
                        volumeType: ec2.EbsDeviceVolumeType.STANDARD,
                        encrypted: true
                    })
                }
            ],
            machineImage: ec2.MachineImage.latestAmazonLinux2(),
            instanceName: bastion_instance_name,
            securityGroup: bastionSecurityGroup,
            subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO)
        });
        // NOTE: the name of the keypair MUST be created manually using the AWS Console under EC2/Keypairs.
        // The name MUST match the name in the BASTION_SSH_EC2_KEYPAIR_NAME variable (see above).
        // The SSH file itself should be placed somewhere the DB importer can find it and then used for
        // doing a remote SSH into the bastion host so the database can be updated.
        // ALSO: don't forget to chmod 0400 the keypair .pem file once it's downloaded.
        this.bastion.instance.instance.addPropertyOverride("KeyName", props.keypairName);
        this.bastion.allowSshAccessFrom();
        // This adds ssh access from any IP address.
        // this.bastion.connections.allowFromAnyIpv4(ec2.Port.tcp(22), "SSH Access")
        let securityGroupName = props.prefix + "_db_sg";
        this.dbSecurityGroup = new ec2.SecurityGroup(this, "db_security_group", {
            vpc: props.vpc,
            securityGroupName: securityGroupName,
            allowAllOutbound: true
        });
        // Allow ingress from Database and HTTPS so SSH bastion as well as lambdas can access it.
        this.dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(parseInt(props.dbPort)), "Database port");
        this.dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(parseInt(props.httpsPort)), "HTTPS port");
        // NOTE: for production, you'll want to further restrict the Security Group by limiting
        // which IP addresses are allowed to connect via SSH.
        // The database secret is generated here. To implement automatic secret rotation, more
        // information can be found here:
        // https://docs.aws.amazon.com/cdk/api/latest/docs/aws-secretsmanager-readme.html#rotating-database-credentials
        //
        this.databaseSecret = new rds.DatabaseSecret(this, 'db_secret', {
            username: props.dbUsername,
            secretName: props.dbPasswordKey
        });
        if (props.useAurora) {
            console.log("    - With Aurora/Postgres version: " + props.postgresFullVersion);
            this.databaseCluster = new rds.DatabaseCluster(this, "db_cluster", {
                defaultDatabaseName: props.dbName,
                engine: rds.DatabaseClusterEngine.auroraPostgres({
                    version: aws_rds_1.AuroraPostgresEngineVersion.of(props.postgresFullVersion, props.postgresMajorVersion),
                }),
                port: parseInt(props.dbPort),
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                storageEncrypted: true,
                credentials: rds.Credentials.fromSecret(this.databaseSecret),
                instanceProps: {
                    instanceType: ec2.InstanceType.of(ec2.InstanceClass.MEMORY5, ec2.InstanceSize.LARGE),
                    vpc: props.vpc,
                    securityGroups: [this.dbSecurityGroup],
                    vpcSubnets: {
                        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
                    }
                },
            });
            this.databaseHostname = this.databaseCluster.clusterEndpoint.hostname;
        }
        else {
            // NOTE: we are using an RDS/Postgres instance instead of an AuroraPostgres instance so we can keep usage costs
            // for development inside the free tier range. This, however, will not scale well.
            // For production use, we should use the Aurora Version so it can auto-scale. But it will not have a
            // free tier option.
            //
            console.log("    - With RDS/Postgres version: " + props.postgresFullVersion);
            const engine = rds.DatabaseInstanceEngine.postgres({
                version: aws_rds_1.PostgresEngineVersion.of(props.postgresFullVersion, props.postgresMajorVersion)
            });
            this.databaseInstance = new rds.DatabaseInstance(this, 'db-instance', {
                vpc: props.vpc,
                databaseName: props.dbName,
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                port: parseInt(props.dbPort),
                engine: engine,
                instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
                credentials: rds.Credentials.fromSecret(this.databaseSecret),
                securityGroups: [this.dbSecurityGroup],
                multiAz: false,
                storageEncrypted: true,
                allocatedStorage: props.allocatedStorage,
                maxAllocatedStorage: props.maxAllocatedStorage,
                allowMajorVersionUpgrade: true,
                autoMinorVersionUpgrade: true,
                backupRetention: cdk.Duration.days(0),
                deleteAutomatedBackups: true,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                deletionProtection: false,
                publiclyAccessible: false,
            });
            this.databaseInstance.connections.allowFrom(this.bastion, ec2.Port.tcp(parseInt(props.dbPort)));
            this.databaseHostname = this.databaseInstance.instanceEndpoint.hostname;
        }
    }
}
exports.CDKDatabase = CDKDatabase;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX2RhdGFiYXNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX2RhdGFiYXNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0VBSUU7QUFDRixtQ0FBbUM7QUFFbkMsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUczQyxxQ0FBK0I7QUFHL0IsaURBQWtFO0FBQ2xFLGlEQUF1RjtBQXFCdEYsQ0FBQztBQUdGLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBUTlDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBcUI7UUFDM0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixlQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEMsc0VBQXNFO1FBRXRFLElBQUksd0JBQXdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQztRQUNoRSxJQUFJLG9CQUFvQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQzNFO1lBQ0ksR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsaUJBQWlCLEVBQUUsd0JBQXdCO1lBQzNDLGdCQUFnQixFQUFFLElBQUk7U0FDekIsQ0FBQyxDQUFDO1FBRVAsMEVBQTBFO1FBQzFFLG9GQUFvRjtRQUNwRixjQUFjO1FBQ2QsRUFBRTtRQUNGLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBRXBDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxjQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLGNBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUE7UUFFeEYsZ0ZBQWdGO1FBQ2hGLG9GQUFvRjtRQUNwRix5QkFBeUI7UUFDekIsRUFBRTtRQUNGLHFGQUFxRjtRQUNyRixjQUFj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QUFDO2dCQUNyQyxzQkFBc0IsRUFBRSxJQUFJO2dCQUM1QixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO2dCQUN4QyxrQkFBa0IsRUFBRSxLQUFLO2dCQUN6QixrQkFBa0IsRUFBRSxLQUFLO2FBQzVCLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEcsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUM7U0FDM0U7SUFDTCxDQUFDO0NBQ0Y7QUE5S0Qsa0NBOEtDIiwic291cmNlc0NvbnRlbnQiOlsiLyogwqkgMjAyMiBBbWF6b24gV2ViIFNlcnZpY2VzLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFNpbXBsZUlPVCBwcm9qZWN0LlxuICogQXV0aG9yOiBSYW1pbiBGaXJvb3p5ZSAoZnJhbWluQGFtYXpvbi5jb20pXG4qL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IGVjMiA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1lYzInKVxuaW1wb3J0IHJkcyA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1yZHMnKVxuaW1wb3J0IGlhbSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1pYW0nKVxuaW1wb3J0IHtJU2VjcmV0LCBTZWNyZXR9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQge0NvbW1vbn0gZnJvbSBcIi4vY29tbW9uXCJcbmltcG9ydCB7Q0RLTGFtYmRhTGF5ZXJ9IGZyb20gXCIuL2Nka19sYW1iZGFsYXllclwiO1xuaW1wb3J0IHtDREtTdGF0aWNJT1R9IGZyb20gXCIuL2Nka19zdGF0aWNpb3RcIjtcbmltcG9ydCB7QmxvY2tEZXZpY2VWb2x1bWUsIFBlZXIsIFBvcnR9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWMyXCI7XG5pbXBvcnQge0F1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbiwgUG9zdGdyZXNFbmdpbmVWZXJzaW9ufSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXJkc1wiO1xuXG5cbmludGVyZmFjZSBJRGF0YWJhc2VQcm9wcyBleHRlbmRzIGNkay5OZXN0ZWRTdGFja1Byb3BzIHtcbiAgICBwcmVmaXg6IHN0cmluZyxcbiAgICB1c2VBdXJvcmE6IGJvb2xlYW4sXG4gICAgdXVpZDogc3RyaW5nLFxuICAgIHZwYzogZWMyLklWcGMsXG4gICAgbXlJcDogc3RyaW5nLFxuICAgIHBvc3RncmVzRnVsbFZlcnNpb246IHN0cmluZyxcbiAgICBwb3N0Z3Jlc01ham9yVmVyc2lvbjogc3RyaW5nLFxuICAgIGRiUG9ydDogc3RyaW5nLFxuICAgIGh0dHBzUG9ydDogc3RyaW5nLFxuICAgIGRiVXNlcm5hbWU6IHN0cmluZyxcbiAgICBkYlBhc3N3b3JkS2V5OiBzdHJpbmcsXG4gICAgZGJOYW1lOiBzdHJpbmcsXG4gICAgYWxsb2NhdGVkU3RvcmFnZTogbnVtYmVyLFxuICAgIG1heEFsbG9jYXRlZFN0b3JhZ2U6IG51bWJlcixcbiAgICBrZXlwYWlyTmFtZTogc3RyaW5nLFxuICAgIG1heEdlbmVyYXRlZFBhc3N3b3JkTGVuZ3RoOiBudW1iZXIsXG4gICAgdGFnczoge1tuYW1lOiBzdHJpbmddOiBhbnl9XG59O1xuXG5cbmV4cG9ydCBjbGFzcyBDREtEYXRhYmFzZSBleHRlbmRzIGNkay5OZXN0ZWRTdGFjayB7XG4gIHB1YmxpYyBiYXN0aW9uOiBlYzIuQmFzdGlvbkhvc3RMaW51eDtcbiAgcHVibGljIGRhdGFiYXNlQ2x1c3RlcjogcmRzLkRhdGFiYXNlQ2x1c3RlcjsgLy8gRm9yIEF1cm9yYSB1c2VcbiAgcHVibGljIGRhdGFiYXNlSW5zdGFuY2U6IHJkcy5EYXRhYmFzZUluc3RhbmNlO1xuICBwdWJsaWMgZGJTZWN1cml0eUdyb3VwIDogZWMyLklTZWN1cml0eUdyb3VwO1xuICBwdWJsaWMgZGF0YWJhc2VIb3N0bmFtZSA6IHN0cmluZztcbiAgcmVhZG9ubHkgZGF0YWJhc2VTZWNyZXQ6IHJkcy5EYXRhYmFzZVNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSURhdGFiYXNlUHJvcHMpIHtcbiAgICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgICAvLyBjb25zb2xlLmxvZyhcIkV4ZWN1dGluZzogRGF0YWJhc2Ugc3RhY2sgd2l0aCBwcmVmaXg6IFwiICsgbmFtZVByZWZpeClcblxuICAgICAgbGV0IGJhc3Rpb25TZWN1cml0eUdyb3VwTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2Jhc3Rpb25fc3NoX3NnXCI7XG4gICAgICBsZXQgYmFzdGlvblNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgXCJiYXN0aW9uX3NlY3VyaXR5X2dyb3VwXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICAgICAgc2VjdXJpdHlHcm91cE5hbWU6IGJhc3Rpb25TZWN1cml0eUdyb3VwTmFtZSxcbiAgICAgICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgICAgICAgIH0pO1xuXG4gICAgICAvLyBOT1RFOiB3ZSBsaW1pdCBhY2Nlc3MgdG8gYmFzdGlvbiBob3N0IHRvIHRoZSBkZXZpY2UgdGhpcyBpcyBydW5uaW5nIG9uLlxuICAgICAgLy8gVGhpcyBtZWFucyBhbnkgZnV0dXJlIGFjY2VzcyB0byB0aGUgYmFzdGlvbiBob3N0IHdpbGwgcmVxdWlyZSBiZWluZyBmcm9tIHRoZSBzYW1lXG4gICAgICAvLyBJUCBhZGRyZXNzLlxuICAgICAgLy9cbiAgICAgIGxldCBpcFdpdGhDSURSID0gcHJvcHMubXlJcCArIFwiLzMyXCI7XG5cbiAgICAgIGJhc3Rpb25TZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuaXB2NChpcFdpdGhDSURSKSwgUG9ydC50Y3AoMjIpLCBcIkluY29taW5nIFNTSFwiKVxuXG4gICAgICAvLyBXZSBjYW4gaGF2ZSBhIGN1c3RvbSBzZWN1cml0eSBncm91cC4gQnV0IHRoZSBhbGxvd19mcm9tX2FueV9pcHY0KCkgY2FsbCBiZWxvd1xuICAgICAgLy8gZG9lcyB0aGUgc2FtZSB0aGluZy4gU28gdGhlc2UgYXJlIGNvbW1lbnRlZCBmb3Igbm93LCBidXQgcHJvdmlkZWQgaW4gY2FzZSB3ZSBuZWVkXG4gICAgICAvLyB0byBjcmVhdGUgYSBjdXN0b20gU0cuXG4gICAgICAvL1xuICAgICAgLy8gQWxsb3cgaW5ncmVzcyBmcm9tIFNTSCAtIGZyb20gYW55IGhvc3QuIFdlIGNhbiB0aWdodGVuIHRoaXMgbW9yZSB0byBzcGVjaWZpYyBob3N0c1xuICAgICAgLy8gaWYgbmVlZCBiZS5cbiAgICAgIC8vXG4gICAgICAvLyBiYXN0aW9uX3NlY3VyaXR5X2dyb3VwLmFkZF9pbmdyZXNzX3J1bGUoZWMyLlBlZXIuYW55X2lwdjQoKSwgZWMyLlBvcnQudGNwKDIyKSwgXCJTU0ggYWNjZXNzXCIpXG4gICAgICAvL1xuICAgICAgLy8gVGhpcyBpcyBhIGJpdCB0b28gcGVybWlzc2l2ZS4gV2UncmUgZ29pbmcgdG8gbmVlZCB0byBhc3NpZ24gYSBkaWZmZXJlbnQgc2VjdXJpdHkgZ3JvdXBcbiAgICAgIC8vIGZvciBhbGxvd2luZyByZHMgdG8gY29udGFjdC5cblxuICAgICAgbGV0IGJhc3Rpb25faW5zdGFuY2VfbmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2RiX2Jhc3Rpb25faG9zdFwiXG4gICAgICB0aGlzLmJhc3Rpb24gPSBuZXcgZWMyLkJhc3Rpb25Ib3N0TGludXgodGhpcywgXCJkYl9iYXN0aW9uX2hvc3RcIiwge1xuICAgICAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICAgICAgYmxvY2tEZXZpY2VzOiBbXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgZGV2aWNlTmFtZTogJy9kZXYveHZkYScsXG4gICAgICAgICAgICAgICAgICAgICAgbWFwcGluZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgdm9sdW1lOiBlYzIuQmxvY2tEZXZpY2VWb2x1bWUuZWJzKDIwLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZU9uVGVybWluYXRpb246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHZvbHVtZVR5cGU6IGVjMi5FYnNEZXZpY2VWb2x1bWVUeXBlLlNUQU5EQVJELFxuICAgICAgICAgICAgICAgICAgICAgICAgICBlbmNyeXB0ZWQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBtYWNoaW5lSW1hZ2U6IGVjMi5NYWNoaW5lSW1hZ2UubGF0ZXN0QW1hem9uTGludXgyKCksXG4gICAgICAgICAgICAgIGluc3RhbmNlTmFtZTogYmFzdGlvbl9pbnN0YW5jZV9uYW1lLFxuICAgICAgICAgICAgICBzZWN1cml0eUdyb3VwOiBiYXN0aW9uU2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgICAgc3VibmV0U2VsZWN0aW9uOiB7c3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDfSxcbiAgICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQyLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKVxuICAgICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIE5PVEU6IHRoZSBuYW1lIG9mIHRoZSBrZXlwYWlyIE1VU1QgYmUgY3JlYXRlZCBtYW51YWxseSB1c2luZyB0aGUgQVdTIENvbnNvbGUgdW5kZXIgRUMyL0tleXBhaXJzLlxuICAgICAgLy8gVGhlIG5hbWUgTVVTVCBtYXRjaCB0aGUgbmFtZSBpbiB0aGUgQkFTVElPTl9TU0hfRUMyX0tFWVBBSVJfTkFNRSB2YXJpYWJsZSAoc2VlIGFib3ZlKS5cbiAgICAgIC8vIFRoZSBTU0ggZmlsZSBpdHNlbGYgc2hvdWxkIGJlIHBsYWNlZCBzb21ld2hlcmUgdGhlIERCIGltcG9ydGVyIGNhbiBmaW5kIGl0IGFuZCB0aGVuIHVzZWQgZm9yXG4gICAgICAvLyBkb2luZyBhIHJlbW90ZSBTU0ggaW50byB0aGUgYmFzdGlvbiBob3N0IHNvIHRoZSBkYXRhYmFzZSBjYW4gYmUgdXBkYXRlZC5cbiAgICAgIC8vIEFMU086IGRvbid0IGZvcmdldCB0byBjaG1vZCAwNDAwIHRoZSBrZXlwYWlyIC5wZW0gZmlsZSBvbmNlIGl0J3MgZG93bmxvYWRlZC5cblxuICAgICAgdGhpcy5iYXN0aW9uLmluc3RhbmNlLmluc3RhbmNlLmFkZFByb3BlcnR5T3ZlcnJpZGUoXCJLZXlOYW1lXCIsIHByb3BzLmtleXBhaXJOYW1lKTtcbiAgICAgIHRoaXMuYmFzdGlvbi5hbGxvd1NzaEFjY2Vzc0Zyb20oKVxuXG4gICAgICAvLyBUaGlzIGFkZHMgc3NoIGFjY2VzcyBmcm9tIGFueSBJUCBhZGRyZXNzLlxuICAgICAgLy8gdGhpcy5iYXN0aW9uLmNvbm5lY3Rpb25zLmFsbG93RnJvbUFueUlwdjQoZWMyLlBvcnQudGNwKDIyKSwgXCJTU0ggQWNjZXNzXCIpXG5cbiAgICAgIGxldCBzZWN1cml0eUdyb3VwTmFtZSA9IHByb3BzLnByZWZpeCArIFwiX2RiX3NnXCI7XG4gICAgICB0aGlzLmRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcImRiX3NlY3VyaXR5X2dyb3VwXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICAgICAgc2VjdXJpdHlHcm91cE5hbWU6IHNlY3VyaXR5R3JvdXBOYW1lLFxuICAgICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgKTtcblxuICAgICAgLy8gQWxsb3cgaW5ncmVzcyBmcm9tIERhdGFiYXNlIGFuZCBIVFRQUyBzbyBTU0ggYmFzdGlvbiBhcyB3ZWxsIGFzIGxhbWJkYXMgY2FuIGFjY2VzcyBpdC5cblxuICAgICAgdGhpcy5kYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AocGFyc2VJbnQocHJvcHMuZGJQb3J0KSksIFwiRGF0YWJhc2UgcG9ydFwiKVxuICAgICAgdGhpcy5kYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AocGFyc2VJbnQocHJvcHMuaHR0cHNQb3J0KSksIFwiSFRUUFMgcG9ydFwiKVxuXG4gICAgICAvLyBOT1RFOiBmb3IgcHJvZHVjdGlvbiwgeW91J2xsIHdhbnQgdG8gZnVydGhlciByZXN0cmljdCB0aGUgU2VjdXJpdHkgR3JvdXAgYnkgbGltaXRpbmdcbiAgICAgIC8vIHdoaWNoIElQIGFkZHJlc3NlcyBhcmUgYWxsb3dlZCB0byBjb25uZWN0IHZpYSBTU0guXG5cbiAgICAgIC8vIFRoZSBkYXRhYmFzZSBzZWNyZXQgaXMgZ2VuZXJhdGVkIGhlcmUuIFRvIGltcGxlbWVudCBhdXRvbWF0aWMgc2VjcmV0IHJvdGF0aW9uLCBtb3JlXG4gICAgICAvLyBpbmZvcm1hdGlvbiBjYW4gYmUgZm91bmQgaGVyZTpcbiAgICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL2xhdGVzdC9kb2NzL2F3cy1zZWNyZXRzbWFuYWdlci1yZWFkbWUuaHRtbCNyb3RhdGluZy1kYXRhYmFzZS1jcmVkZW50aWFsc1xuICAgICAgLy9cbiAgICAgIHRoaXMuZGF0YWJhc2VTZWNyZXQgPSBuZXcgcmRzLkRhdGFiYXNlU2VjcmV0KHRoaXMsICdkYl9zZWNyZXQnLCB7XG4gICAgICAgICAgdXNlcm5hbWU6IHByb3BzLmRiVXNlcm5hbWUsXG4gICAgICAgICAgc2VjcmV0TmFtZTogcHJvcHMuZGJQYXNzd29yZEtleVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChwcm9wcy51c2VBdXJvcmEpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcIiAgICAtIFdpdGggQXVyb3JhL1Bvc3RncmVzIHZlcnNpb246IFwiICsgcHJvcHMucG9zdGdyZXNGdWxsVmVyc2lvbilcbiAgICAgICAgICB0aGlzLmRhdGFiYXNlQ2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsIFwiZGJfY2x1c3RlclwiLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0RGF0YWJhc2VOYW1lOiBwcm9wcy5kYk5hbWUsXG4gICAgICAgICAgICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICAgICAgICAgICAgICAgIHZlcnNpb246IEF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5vZihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcHMucG9zdGdyZXNGdWxsVmVyc2lvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcHMucG9zdGdyZXNNYWpvclZlcnNpb25cbiAgICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICBwb3J0OiBwYXJzZUludChwcm9wcy5kYlBvcnQpLFxuICAgICAgICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgICAgICAgIHN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYXRhYmFzZVNlY3JldCksXG4gICAgICAgICAgICAgICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLk1FTU9SWTUsIGVjMi5JbnN0YW5jZVNpemUuTEFSR0UpLFxuICAgICAgICAgICAgICAgICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICAgICAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICAgIHRoaXMuZGF0YWJhc2VIb3N0bmFtZSA9IHRoaXMuZGF0YWJhc2VDbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZTtcblxuICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgIC8vIE5PVEU6IHdlIGFyZSB1c2luZyBhbiBSRFMvUG9zdGdyZXMgaW5zdGFuY2UgaW5zdGVhZCBvZiBhbiBBdXJvcmFQb3N0Z3JlcyBpbnN0YW5jZSBzbyB3ZSBjYW4ga2VlcCB1c2FnZSBjb3N0c1xuICAgICAgICAgIC8vIGZvciBkZXZlbG9wbWVudCBpbnNpZGUgdGhlIGZyZWUgdGllciByYW5nZS4gVGhpcywgaG93ZXZlciwgd2lsbCBub3Qgc2NhbGUgd2VsbC5cbiAgICAgICAgICAvLyBGb3IgcHJvZHVjdGlvbiB1c2UsIHdlIHNob3VsZCB1c2UgdGhlIEF1cm9yYSBWZXJzaW9uIHNvIGl0IGNhbiBhdXRvLXNjYWxlLiBCdXQgaXQgd2lsbCBub3QgaGF2ZSBhXG4gICAgICAgICAgLy8gZnJlZSB0aWVyIG9wdGlvbi5cbiAgICAgICAgICAvL1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgIC0gV2l0aCBSRFMvUG9zdGdyZXMgdmVyc2lvbjogXCIgKyBwcm9wcy5wb3N0Z3Jlc0Z1bGxWZXJzaW9uKVxuICAgICAgICAgIGNvbnN0IGVuZ2luZSA9IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgICAgICAgdmVyc2lvbjogUG9zdGdyZXNFbmdpbmVWZXJzaW9uLm9mKFxuICAgICAgICAgICAgICAgICAgcHJvcHMucG9zdGdyZXNGdWxsVmVyc2lvbixcbiAgICAgICAgICAgICAgICAgIHByb3BzLnBvc3RncmVzTWFqb3JWZXJzaW9uKVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgdGhpcy5kYXRhYmFzZUluc3RhbmNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdkYi1pbnN0YW5jZScsIHtcbiAgICAgICAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgICAgICAgIGRhdGFiYXNlTmFtZTogcHJvcHMuZGJOYW1lLFxuICAgICAgICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHBvcnQ6IHBhcnNlSW50KHByb3BzLmRiUG9ydCksXG4gICAgICAgICAgICAgIGVuZ2luZTogZW5naW5lLFxuICAgICAgICAgICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoXG4gICAgICAgICAgICAgICAgICBlYzIuSW5zdGFuY2VDbGFzcy5CVVJTVEFCTEUzLFxuICAgICAgICAgICAgICAgICAgZWMyLkluc3RhbmNlU2l6ZS5NSUNST1xuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYXRhYmFzZVNlY3JldCksXG4gICAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5kYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgICBtdWx0aUF6OiBmYWxzZSxcbiAgICAgICAgICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgYWxsb2NhdGVkU3RvcmFnZTogcHJvcHMuYWxsb2NhdGVkU3RvcmFnZSxcbiAgICAgICAgICAgICAgbWF4QWxsb2NhdGVkU3RvcmFnZTogcHJvcHMubWF4QWxsb2NhdGVkU3RvcmFnZSxcbiAgICAgICAgICAgICAgYWxsb3dNYWpvclZlcnNpb25VcGdyYWRlOiB0cnVlLFxuICAgICAgICAgICAgICBhdXRvTWlub3JWZXJzaW9uVXBncmFkZTogdHJ1ZSxcbiAgICAgICAgICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cygwKSxcbiAgICAgICAgICAgICAgZGVsZXRlQXV0b21hdGVkQmFja3VwczogdHJ1ZSxcbiAgICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgICAgICAgcHVibGljbHlBY2Nlc3NpYmxlOiBmYWxzZSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHRoaXMuZGF0YWJhc2VJbnN0YW5jZS5jb25uZWN0aW9ucy5hbGxvd0Zyb20odGhpcy5iYXN0aW9uLCBlYzIuUG9ydC50Y3AocGFyc2VJbnQocHJvcHMuZGJQb3J0KSkpO1xuICAgICAgICAgIHRoaXMuZGF0YWJhc2VIb3N0bmFtZSA9IHRoaXMuZGF0YWJhc2VJbnN0YW5jZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lO1xuICAgICAgfVxuICB9XG59XG4iXX0=