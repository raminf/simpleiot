"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDKS3 = void 0;
/* © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
 *
 * SimpleIOT project.
 * Author: Ramin Firoozye (framin@amazon.com)
 */
const cdk = require("aws-cdk-lib");
const aws_s3_1 = require("aws-cdk-lib/aws-s3");
const s3 = require("aws-cdk-lib/aws-s3");
const cf = require("aws-cdk-lib/aws-cloudfront");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const common_1 = require("./common");
const path = require("path");
;
class CDKS3 extends cdk.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        common_1.Common.addTags(this, props.tags);
        // Buckets can't have underlines in the name so we convert them to dashes.
        // NOTE: check here for more details on deploying SPAs: https://github.com/aws/aws-cdk/issues/4928
        //
        let bucketPrefix = props.prefix.replace("_", "-");
        this.dashboardBucketName = bucketPrefix + "-dashboard-" + props.uuid;
        this.dashboardBucket = new s3.Bucket(this, id + "_dashboard_bucket", {
            bucketName: this.dashboardBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            websiteIndexDocument: "index.html",
            websiteErrorDocument: 'index.html',
            cors: [
                {
                    allowedOrigins: ['*'],
                    allowedMethods: [s3.HttpMethods.GET],
                }
            ],
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            objectOwnership: aws_s3_1.ObjectOwnership.OBJECT_WRITER
        });
        const dashboardOIA = new cf.OriginAccessIdentity(this, 'dashboardOIA', {
            comment: "Dashboard OIA"
        });
        this.dashboardBucket.grantRead(dashboardOIA);
        // If we wanted to deploy a dashboard here, this is what we would use. But we first have to
        // get the API and IOT endpoints as well as Cognito identifiers, then rebuild the dashboard
        // before copying it out. So the actual copying will have to wait until after those have
        // been created and the configuration files properly set up.
        //
        // const dashboardDeployment = new BucketDeployment(this, 'DeployWebsite', {
        //       sources: [Source.asset('dist')],
        //       destinationBucket: this.dashboardBucket
        //     });
        this.dashboardCFDistribution = new cf.CloudFrontWebDistribution(this, 'dashboard_cloudfront_dist', {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: this.dashboardBucket,
                        originAccessIdentity: dashboardOIA
                    },
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ]
        });
        this.fwUpdateBucketName = bucketPrefix + "-fw-update-" + props.uuid;
        this.fwUpdateBucket = new s3.Bucket(this, id + "_fw_update_bucket", {
            bucketName: this.fwUpdateBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            objectOwnership: aws_s3_1.ObjectOwnership.OBJECT_WRITER
        });
        const fwUpdateOIA = new cf.OriginAccessIdentity(this, 'fwupdateOIA', {
            comment: "FW Update OIA"
        });
        this.fwUpdateBucket.grantRead(fwUpdateOIA);
        // This one is for firmware update downloads. There's no default root object.
        //
        this.fwUpdateCFDistribution = new cf.CloudFrontWebDistribution(this, 'fwupdate_cloudfront_dist', {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: this.fwUpdateBucket,
                        originAccessIdentity: fwUpdateOIA
                    },
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ]
        });
        this.twinMediaBucketName = bucketPrefix + "-twin-media-" + props.uuid;
        this.twinMediaBucket = new s3.Bucket(this, id + "_twin_media_bucket", {
            bucketName: this.twinMediaBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            objectOwnership: aws_s3_1.ObjectOwnership.OBJECT_WRITER
        });
        const twinMediaOIA = new cf.OriginAccessIdentity(this, 'twinOIA', {
            comment: "Twin Media OIA"
        });
        this.twinMediaBucket.grantRead(twinMediaOIA);
        // This one is for Digital Twin Media downloads. There's no default root object.
        //
        this.twinMediaCFDistribution = new cf.CloudFrontWebDistribution(this, 'twin_cloudfront_dist', {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: this.twinMediaBucket,
                        originAccessIdentity: twinMediaOIA
                    },
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ]
        });
        // For static media not only do we need to create the buckets but we also need to
        // Load it with material and images. NOTE: templates and generators do not need
        // to be accessed externally from the web. They are used internally by the lambdas
        // behind the scenes.
        //
        this.templateBucketName = bucketPrefix + "-template-" + props.uuid;
        this.templateBucket = new s3.Bucket(this, id + "_template_bucket", {
            bucketName: this.templateBucketName,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            objectOwnership: aws_s3_1.ObjectOwnership.OBJECT_WRITER
        });
        // For generators (code samples that generate skeleton firmware).
        //
        this.generatorBucketName = bucketPrefix + "-generator-" + props.uuid;
        this.generatorBucket = new s3.Bucket(this, id + "_generator_bucket", {
            bucketName: this.generatorBucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
            // serverAccessLogsPrefix: "LOGS",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            objectOwnership: aws_s3_1.ObjectOwnership.OBJECT_WRITER
        });
        // We don't allow read access to the bucket, but set it so the contents can be
        // read publicly -- this requires direct access to the contents.
        // NOTE: for dev mode, we comment this out and manually set each object to public.
        //
        // this.staticMediaBucket.addToResourcePolicy(
        //   new iam.PolicyStatement({
        //     actions: ['s3:GetObject'],
        //     resources: [ this.staticMediaBucket.arnForObjects('*')],
        //     principals: [new iam.AnyPrincipal()]
        //   })
        // );
        let template_source_path = path.resolve(props.s3UploadRoot, "template_files");
        this.templateBucketDeployment = new s3deploy.BucketDeployment(this, "template_s3_deployment", {
            sources: [
                s3deploy.Source.asset(template_source_path)
            ],
            destinationBucket: this.templateBucket
        });
    }
}
exports.CDKS3 = CDKS3;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrX3MzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrX3MzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0dBSUc7QUFDSCxtQ0FBbUM7QUFFbkMsK0NBQW1EO0FBQ25ELHlDQUEwQztBQUMxQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELHFDQUErQjtBQUUvQixNQUFNLElBQUksR0FBRyxPQUFPLENBQUUsTUFBTSxDQUFFLENBQUE7QUFRN0IsQ0FBQztBQUdGLE1BQWEsS0FBTSxTQUFRLEdBQUcsQ0FBQyxXQUFXO0lBdUJ4QyxZQUFZLEtBQWdCLEVBQ2hCLEVBQVUsRUFBRyxLQUFlO1FBRXRDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakIsZUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRWhDLDBFQUEwRTtRQUMxRSxrR0FBa0c7UUFDbEcsRUFBRTtRQUNGLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUVsRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsWUFBWSxHQUFHLGFBQWEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3JFLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLEdBQUcsbUJBQW1CLEVBQy9EO1lBQ0ksVUFBVSxFQUFFLElBQUksQ0FBQyxtQkFBbUI7WUFDcEMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLG9CQUFvQixFQUFFLFlBQVk7WUFDbEMsb0JBQW9CLEVBQUUsWUFBWTtZQUNsQyxJQUFJLEVBQUU7Z0JBQ0Y7b0JBQ0ksY0FBYyxFQUFFLENBQUMsR0FBRyxDQUFDO29CQUNyQixjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFD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LE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFFOUUsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBQyx3QkFBd0IsRUFDdkY7WUFDRSxPQUFPLEVBQUU7Z0JBQ0wsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUM7YUFDOUM7WUFDRCxpQkFBaUIsRUFBRSxJQUFJLENBQUMsY0FBYztTQUN2QyxDQUNKLENBQUE7SUFDSCxDQUFDO0NBQ0Y7QUEvTUQsc0JBK01DIiwic291cmNlc0NvbnRlbnQiOlsiLyogwqkgMjAyMiBBbWF6b24gV2ViIFNlcnZpY2VzLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFNpbXBsZUlPVCBwcm9qZWN0LlxuICogQXV0aG9yOiBSYW1pbiBGaXJvb3p5ZSAoZnJhbWluQGFtYXpvbi5jb20pXG4gKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7T2JqZWN0T3duZXJzaGlwfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgczMgPSByZXF1aXJlKCdhd3MtY2RrLWxpYi9hd3MtczMnKTtcbmltcG9ydCBjZiA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JylcbmltcG9ydCBzM2RlcGxveSA9IHJlcXVpcmUoJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JylcbmltcG9ydCB7Q29tbW9ufSBmcm9tICcuL2NvbW1vbidcblxuY29uc3QgcGF0aCA9IHJlcXVpcmUoIFwicGF0aFwiIClcblxuaW50ZXJmYWNlIElTM1Byb3BzIGV4dGVuZHMgY2RrLk5lc3RlZFN0YWNrUHJvcHMge1xuICAgIHByZWZpeDogc3RyaW5nLFxuICAgIHN0YWdlOiBzdHJpbmcsXG4gICAgdXVpZDogc3RyaW5nLFxuICAgIHMzVXBsb2FkUm9vdDogc3RyaW5nLFxuICAgIHRhZ3M6IHtbbmFtZTogc3RyaW5nXTogYW55fVxufTtcblxuXG5leHBvcnQgY2xhc3MgQ0RLUzMgZXh0ZW5kcyBjZGsuTmVzdGVkU3RhY2sge1xuICBwdWJsaWMgZGFzaGJvYXJkQnVja2V0TmFtZTogc3RyaW5nO1xuICBwdWJsaWMgZndVcGRhdGVCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyB0d2luTWVkaWFCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBmd1VwZGF0ZUNsb3VkRnJvbnRVcmw6IHN0cmluZztcbiAgcHVibGljIHR3aW5NZWRpYUNsb3VkRnJvbnRVcmw6IHN0cmluZztcbiAgcHVibGljIHRlbXBsYXRlQnVja2V0TmFtZTogc3RyaW5nO1xuICBwdWJsaWMgZ2VuZXJhdG9yQnVja2V0TmFtZTogc3RyaW5nO1xuICBwdWJsaWMgZGFzaGJvYXJkQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyBkYXNoYm9hcmRDRkRpc3RyaWJ1dGlvbjogY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbjtcbiAgcHVibGljIGZ3VXBkYXRlQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyBmd1VwZGF0ZUNGRGlzdHJpYnV0aW9uOiBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgdGVtcGxhdGVCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHR3aW5NZWRpYUJ1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgdHdpbk1lZGlhQ0ZEaXN0cmlidXRpb246IGNmLkNsb3VkRnJvbnRXZWJEaXN0cmlidXRpb247XG4gIHB1YmxpYyBnZW5lcmF0b3JCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgICAvL1xuICAgIC8vIEFuIFMzIGJ1Y2tldCBkZXBsb3ltZW50IGFsbG93cyB3ZWJzaXRlcyB0byBiZSB1cGxvYWRlZCBmcm9tIGEgbG9jYWwgZGlyZWN0b3J5LlxuICAgIC8vIFdlJ2xsIG5lZWQgb25lIGZvciB0aGUgZGFzaGJvYXJkIGluIHN1YnNlcXVlbnQgcGhhc2VzLlxuICAgIC8vXG4gIHB1YmxpYyB0ZW1wbGF0ZUJ1Y2tldERlcGxveW1lbnQ6IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQ7XG5cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LFxuICAgICAgICAgICAgICBpZDogc3RyaW5nLCAgcHJvcHM6IElTM1Byb3BzKVxuICB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICBDb21tb24uYWRkVGFncyh0aGlzLCBwcm9wcy50YWdzKVxuXG4gICAgLy8gQnVja2V0cyBjYW4ndCBoYXZlIHVuZGVybGluZXMgaW4gdGhlIG5hbWUgc28gd2UgY29udmVydCB0aGVtIHRvIGRhc2hlcy5cbiAgICAvLyBOT1RFOiBjaGVjayBoZXJlIGZvciBtb3JlIGRldGFpbHMgb24gZGVwbG95aW5nIFNQQXM6IGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay9pc3N1ZXMvNDkyOFxuICAgIC8vXG4gICAgbGV0IGJ1Y2tldFByZWZpeCA9IHByb3BzLnByZWZpeC5yZXBsYWNlKFwiX1wiLCBcIi1cIik7XG5cbiAgICB0aGlzLmRhc2hib2FyZEJ1Y2tldE5hbWUgPSBidWNrZXRQcmVmaXggKyBcIi1kYXNoYm9hcmQtXCIgKyBwcm9wcy51dWlkO1xuICAgIHRoaXMuZGFzaGJvYXJkQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBpZCArIFwiX2Rhc2hib2FyZF9idWNrZXRcIixcbiAgICAgICAge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogdGhpcy5kYXNoYm9hcmRCdWNrZXROYW1lLFxuICAgICAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICAgICAgd2Vic2l0ZUluZGV4RG9jdW1lbnQ6IFwiaW5kZXguaHRtbFwiLFxuICAgICAgICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6ICdpbmRleC5odG1sJyxcbiAgICAgICAgICAgIGNvcnM6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICAgICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVRdLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgICAgICAgYWNjZXNzQ29udHJvbDogczMuQnVja2V0QWNjZXNzQ29udHJvbC5MT0dfREVMSVZFUllfV1JJVEUsXG4gICAgICAgICAgICAvLyBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiBcIkxPR1NcIixcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgICAgICAgIG9iamVjdE93bmVyc2hpcDogT2JqZWN0T3duZXJzaGlwLk9CSkVDVF9XUklURVJcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBkYXNoYm9hcmRPSUEgPSBuZXcgY2YuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ2Rhc2hib2FyZE9JQScsIHtcbiAgICAgIGNvbW1lbnQ6IFwiRGFzaGJvYXJkIE9JQVwiXG4gICAgfSk7XG4gICAgdGhpcy5kYXNoYm9hcmRCdWNrZXQuZ3JhbnRSZWFkKGRhc2hib2FyZE9JQSk7XG5cbiAgICAvLyBJZiB3ZSB3YW50ZWQgdG8gZGVwbG95IGEgZGFzaGJvYXJkIGhlcmUsIHRoaXMgaXMgd2hhdCB3ZSB3b3VsZCB1c2UuIEJ1dCB3ZSBmaXJzdCBoYXZlIHRvXG4gICAgLy8gZ2V0IHRoZSBBUEkgYW5kIElPVCBlbmRwb2ludHMgYXMgd2VsbCBhcyBDb2duaXRvIGlkZW50aWZpZXJzLCB0aGVuIHJlYnVpbGQgdGhlIGRhc2hib2FyZFxuICAgIC8vIGJlZm9yZSBjb3B5aW5nIGl0IG91dC4gU28gdGhlIGFjdHVhbCBjb3B5aW5nIHdpbGwgaGF2ZSB0byB3YWl0IHVudGlsIGFmdGVyIHRob3NlIGhhdmVcbiAgICAvLyBiZWVuIGNyZWF0ZWQgYW5kIHRoZSBjb25maWd1cmF0aW9uIGZpbGVzIHByb3Blcmx5IHNldCB1cC5cbiAgICAvL1xuXG4gICAgLy8gY29uc3QgZGFzaGJvYXJkRGVwbG95bWVudCA9IG5ldyBCdWNrZXREZXBsb3ltZW50KHRoaXMsICdEZXBsb3lXZWJzaXRlJywge1xuICAgIC8vICAgICAgIHNvdXJjZXM6IFtTb3VyY2UuYXNzZXQoJ2Rpc3QnKV0sXG4gICAgLy8gICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHRoaXMuZGFzaGJvYXJkQnVja2V0XG4gICAgLy8gICAgIH0pO1xuXG4gICAgdGhpcy5kYXNoYm9hcmRDRkRpc3RyaWJ1dGlvbiA9IG5ldyBjZi5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uKHRoaXMsICdkYXNoYm9hcmRfY2xvdWRmcm9udF9kaXN0Jywge1xuICAgICAgICBvcmlnaW5Db25maWdzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgczNPcmlnaW5Tb3VyY2U6IHtcbiAgICAgICAgICAgICAgICAgICAgczNCdWNrZXRTb3VyY2U6IHRoaXMuZGFzaGJvYXJkQnVja2V0LFxuICAgICAgICAgICAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eTogZGFzaGJvYXJkT0lBXG5cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGJlaGF2aW9yczogW3tpc0RlZmF1bHRCZWhhdmlvcjogdHJ1ZX1dXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9KTtcblxuICAgIHRoaXMuZndVcGRhdGVCdWNrZXROYW1lID0gYnVja2V0UHJlZml4ICsgXCItZnctdXBkYXRlLVwiICsgcHJvcHMudXVpZDtcbiAgICB0aGlzLmZ3VXBkYXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBpZCArIFwiX2Z3X3VwZGF0ZV9idWNrZXRcIixcbiAgICAgICAge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogdGhpcy5md1VwZGF0ZUJ1Y2tldE5hbWUsXG4gICAgICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgICAgICAgYWNjZXNzQ29udHJvbDogczMuQnVja2V0QWNjZXNzQ29udHJvbC5MT0dfREVMSVZFUllfV1JJVEUsXG4gICAgICAgICAgICAvLyBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiBcIkxPR1NcIixcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgICAgICAgIG9iamVjdE93bmVyc2hpcDogT2JqZWN0T3duZXJzaGlwLk9CSkVDVF9XUklURVJcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBmd1VwZGF0ZU9JQSA9IG5ldyBjZi5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnZnd1cGRhdGVPSUEnLCB7XG4gICAgICBjb21tZW50OiBcIkZXIFVwZGF0ZSBPSUFcIlxuICAgIH0pO1xuICAgIHRoaXMuZndVcGRhdGVCdWNrZXQuZ3JhbnRSZWFkKGZ3VXBkYXRlT0lBKTtcblxuICAgIC8vIFRoaXMgb25lIGlzIGZvciBmaXJtd2FyZSB1cGRhdGUgZG93bmxvYWRzLiBUaGVyZSdzIG5vIGRlZmF1bHQgcm9vdCBvYmplY3QuXG4gICAgLy9cbiAgICB0aGlzLmZ3VXBkYXRlQ0ZEaXN0cmlidXRpb24gPSBuZXcgY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbih0aGlzLCAnZnd1cGRhdGVfY2xvdWRmcm9udF9kaXN0Jywge1xuICAgICAgICBvcmlnaW5Db25maWdzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgczNPcmlnaW5Tb3VyY2U6IHtcbiAgICAgICAgICAgICAgICAgICAgczNCdWNrZXRTb3VyY2U6IHRoaXMuZndVcGRhdGVCdWNrZXQsXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5OiBmd1VwZGF0ZU9JQVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgYmVoYXZpb3JzOiBbe2lzRGVmYXVsdEJlaGF2aW9yOiB0cnVlfV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgdGhpcy50d2luTWVkaWFCdWNrZXROYW1lID0gYnVja2V0UHJlZml4ICsgXCItdHdpbi1tZWRpYS1cIiArIHByb3BzLnV1aWQ7XG4gICAgdGhpcy50d2luTWVkaWFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfdHdpbl9tZWRpYV9idWNrZXRcIixcbiAgICAgICAge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogdGhpcy50d2luTWVkaWFCdWNrZXROYW1lLFxuICAgICAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2w6IHMzLkJ1Y2tldEFjY2Vzc0NvbnRyb2wuTE9HX0RFTElWRVJZX1dSSVRFLFxuICAgICAgICAgICAgLy8gc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogXCJMT0dTXCIsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICAgICAgICBvYmplY3RPd25lcnNoaXA6IE9iamVjdE93bmVyc2hpcC5PQkpFQ1RfV1JJVEVSXG4gICAgICAgIH1cbiAgICApO1xuICAgIGNvbnN0IHR3aW5NZWRpYU9JQSA9IG5ldyBjZi5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAndHdpbk9JQScsIHtcbiAgICAgIGNvbW1lbnQ6IFwiVHdpbiBNZWRpYSBPSUFcIlxuICAgIH0pO1xuICAgIHRoaXMudHdpbk1lZGlhQnVja2V0LmdyYW50UmVhZCh0d2luTWVkaWFPSUEpO1xuXG4gICAgLy8gVGhpcyBvbmUgaXMgZm9yIERpZ2l0YWwgVHdpbiBNZWRpYSBkb3dubG9hZHMuIFRoZXJlJ3Mgbm8gZGVmYXVsdCByb290IG9iamVjdC5cbiAgICAvL1xuICAgIHRoaXMudHdpbk1lZGlhQ0ZEaXN0cmlidXRpb24gPSBuZXcgY2YuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbih0aGlzLCAndHdpbl9jbG91ZGZyb250X2Rpc3QnLCB7XG4gICAgICAgIG9yaWdpbkNvbmZpZ3M6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzM09yaWdpblNvdXJjZToge1xuICAgICAgICAgICAgICAgICAgICBzM0J1Y2tldFNvdXJjZTogdGhpcy50d2luTWVkaWFCdWNrZXQsXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5OiB0d2luTWVkaWFPSUFcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGJlaGF2aW9yczogW3tpc0RlZmF1bHRCZWhhdmlvcjogdHJ1ZX1dXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEZvciBzdGF0aWMgbWVkaWEgbm90IG9ubHkgZG8gd2UgbmVlZCB0byBjcmVhdGUgdGhlIGJ1Y2tldHMgYnV0IHdlIGFsc28gbmVlZCB0b1xuICAgIC8vIExvYWQgaXQgd2l0aCBtYXRlcmlhbCBhbmQgaW1hZ2VzLiBOT1RFOiB0ZW1wbGF0ZXMgYW5kIGdlbmVyYXRvcnMgZG8gbm90IG5lZWRcbiAgICAvLyB0byBiZSBhY2Nlc3NlZCBleHRlcm5hbGx5IGZyb20gdGhlIHdlYi4gVGhleSBhcmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBsYW1iZGFzXG4gICAgLy8gYmVoaW5kIHRoZSBzY2VuZXMuXG4gICAgLy9cbiAgICB0aGlzLnRlbXBsYXRlQnVja2V0TmFtZSA9IGJ1Y2tldFByZWZpeCArIFwiLXRlbXBsYXRlLVwiICsgcHJvcHMudXVpZDtcbiAgICB0aGlzLnRlbXBsYXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBpZCArIFwiX3RlbXBsYXRlX2J1Y2tldFwiLFxuICAgICAgICB7XG4gICAgICAgICAgICBidWNrZXROYW1lOiB0aGlzLnRlbXBsYXRlQnVja2V0TmFtZSxcbiAgICAgICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAgICAgICBhY2Nlc3NDb250cm9sOiBzMy5CdWNrZXRBY2Nlc3NDb250cm9sLkxPR19ERUxJVkVSWV9XUklURSxcbiAgICAgICAgICAgIC8vIHNlcnZlckFjY2Vzc0xvZ3NQcmVmaXg6IFwiTE9HU1wiLFxuICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgICAgICAgb2JqZWN0T3duZXJzaGlwOiBPYmplY3RPd25lcnNoaXAuT0JKRUNUX1dSSVRFUlxuICAgICAgICB9XG4gICAgKVxuXG4gICAgLy8gRm9yIGdlbmVyYXRvcnMgKGNvZGUgc2FtcGxlcyB0aGF0IGdlbmVyYXRlIHNrZWxldG9uIGZpcm13YXJlKS5cbiAgICAvL1xuICAgIHRoaXMuZ2VuZXJhdG9yQnVja2V0TmFtZSA9IGJ1Y2tldFByZWZpeCArIFwiLWdlbmVyYXRvci1cIiArIHByb3BzLnV1aWQ7XG4gICAgdGhpcy5nZW5lcmF0b3JCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGlkICsgXCJfZ2VuZXJhdG9yX2J1Y2tldFwiLFxuICAgICAgICB7XG4gICAgICAgICAgICBidWNrZXROYW1lOiB0aGlzLmdlbmVyYXRvckJ1Y2tldE5hbWUsXG4gICAgICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgICAgICAgYWNjZXNzQ29udHJvbDogczMuQnVja2V0QWNjZXNzQ29udHJvbC5MT0dfREVMSVZFUllfV1JJVEUsXG4gICAgICAgICAgICAvLyBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiBcIkxPR1NcIixcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgICAgICAgIG9iamVjdE93bmVyc2hpcDogT2JqZWN0T3duZXJzaGlwLk9CSkVDVF9XUklURVJcbiAgICAgICAgfVxuICAgIClcbiAgICAvLyBXZSBkb24ndCBhbGxvdyByZWFkIGFjY2VzcyB0byB0aGUgYnVja2V0LCBidXQgc2V0IGl0IHNvIHRoZSBjb250ZW50cyBjYW4gYmVcbiAgICAvLyByZWFkIHB1YmxpY2x5IC0tIHRoaXMgcmVxdWlyZXMgZGlyZWN0IGFjY2VzcyB0byB0aGUgY29udGVudHMuXG4gICAgLy8gTk9URTogZm9yIGRldiBtb2RlLCB3ZSBjb21tZW50IHRoaXMgb3V0IGFuZCBtYW51YWxseSBzZXQgZWFjaCBvYmplY3QgdG8gcHVibGljLlxuICAgIC8vXG5cbiAgICAvLyB0aGlzLnN0YXRpY01lZGlhQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgLy8gICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgLy8gICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgLy8gICAgIHJlc291cmNlczogWyB0aGlzLnN0YXRpY01lZGlhQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgLy8gICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXVxuICAgIC8vICAgfSlcbiAgICAvLyApO1xuXG4gICAgbGV0IHRlbXBsYXRlX3NvdXJjZV9wYXRoID0gcGF0aC5yZXNvbHZlKHByb3BzLnMzVXBsb2FkUm9vdCwgXCJ0ZW1wbGF0ZV9maWxlc1wiKTtcblxuICAgIHRoaXMudGVtcGxhdGVCdWNrZXREZXBsb3ltZW50ID0gbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcyxcInRlbXBsYXRlX3MzX2RlcGxveW1lbnRcIixcbiAgICAgICAge1xuICAgICAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHRlbXBsYXRlX3NvdXJjZV9wYXRoKVxuICAgICAgICAgIF0sXG4gICAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHRoaXMudGVtcGxhdGVCdWNrZXRcbiAgICAgICAgfVxuICAgIClcbiAgfVxufVxuIl19