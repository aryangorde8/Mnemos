# Mnemos on AWS — one EC2 instance running docker-compose (web + agent).
#
# Auth: export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (an IAM user with
# EC2 permissions), then:
#   terraform init
#   terraform apply -var key_name=<your-ec2-key-pair-name>
#
# Outputs the public IP; then follow docs/DEPLOY_AWS.md to ssh in and start
# the stack. Default instance is t3.small (~2GB — comfortable for both
# containers); t3.micro works for free-tier accounts but is tight.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type (t3.micro for free tier, t3.small recommended)"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "Name of an EXISTING EC2 key pair. Leave empty to auto-generate one (private key written to ./mnemos-tf.pem)."
  type        = string
  default     = ""
}

# Auto-generated key pair when var.key_name is empty — no console step needed.
# NOTE: the private key lives in terraform state and ./mnemos-tf.pem (0400);
# fine for a demo box, rotate for anything serious.
resource "tls_private_key" "mnemos" {
  count     = var.key_name == "" ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "mnemos" {
  count      = var.key_name == "" ? 1 : 0
  key_name   = "mnemos-tf"
  public_key = tls_private_key.mnemos[0].public_key_openssh
}

resource "local_sensitive_file" "pem" {
  count           = var.key_name == "" ? 1 : 0
  filename        = "${path.module}/mnemos-tf.pem"
  content         = tls_private_key.mnemos[0].private_key_pem
  file_permission = "0400"
}

locals {
  effective_key_name = var.key_name != "" ? var.key_name : aws_key_pair.mnemos[0].key_name
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH (tighten to <your-ip>/32)"
  type        = string
  default     = "0.0.0.0/0"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "mnemos" {
  name_prefix = "mnemos-"
  description = "Mnemos: SSH + HTTP(S)"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }
  ingress {
    description = "HTTP (web app)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS (if TLS is added later)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "mnemos" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = local.effective_key_name
  vpc_security_group_ids = [aws_security_group.mnemos.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  # Install Docker Engine + compose plugin on first boot.
  user_data = <<-EOF
    #!/bin/bash
    set -eux
    apt-get update -y
    apt-get install -y ca-certificates curl git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    usermod -aG docker ubuntu
  EOF

  tags = {
    Name = "mnemos"
  }
}

resource "aws_eip" "mnemos" {
  instance = aws_instance.mnemos.id
  domain   = "vpc"
}

output "public_ip" {
  value       = aws_eip.mnemos.public_ip
  description = "Web app: http://<public_ip>/"
}

output "ssh_command" {
  value       = "ssh -i ${var.key_name == "" ? "${path.module}/mnemos-tf.pem" : "<path-to-your-key.pem>"} ubuntu@${aws_eip.mnemos.public_ip}"
  description = "SSH into the box (wait ~2 min after apply for cloud-init to finish)"
}
