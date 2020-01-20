name := "sclera-plugin-webdisplay"

description := "Plot Sclera query results in a web-browser"

version := "4.0-SNAPSHOT"

organization := "com.scleradb"

organizationName := "Sclera, Inc."

organizationHomepage := Some(url("https://www.scleradb.com"))

startYear := Some(2012)

scalaVersion := "2.13.1"

licenses := Seq("Apache License version 2.0" -> url("https://www.apache.org/licenses/LICENSE-2.0.txt"))

libraryDependencies ++= Seq(
    "ch.qos.logback" % "logback-classic" % "1.2.3" % "provided",
    "io.javalin" % "javalin" % "3.7.0",
    "com.scleradb" %% "sclera-display" % "4.0-SNAPSHOT" % "provided",
    "com.scleradb" %% "sclera-core" % "4.0-SNAPSHOT" % "provided"
)

scalacOptions ++= Seq(
    "-Werror", "-feature", "-deprecation", "-unchecked"
)

exportJars := true
