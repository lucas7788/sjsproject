package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}

type user struct {
	ObjectType    string `json:"docType"` //docType is used to distinguish the various types of objects in state database
	UserId        string `json:"userid"`    //the fieldtags are needed to keep case from bouncing around
	UserName      string `json:"username"`
	UserAddress   string `json:"useraddress"`
	Gender        string `json:"gender"`
	UserType      string `json:"usertype"`
}

// ===================================================================================
// Main
// ===================================================================================
func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}

// Init initializes chaincode
// ===========================
func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) pb.Response {
	return shim.Success(nil)
}

// Invoke - Our entry point for Invocations
// ========================================
func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
	function, args := stub.GetFunctionAndParameters()
	fmt.Println("invoke is running " + function)

	// Handle different functions
	if function == "AddUser" { //create a new marble
		return t.AddUser(stub, args)
	} else if function == "delete" { //delete a marble
		return t.delete(stub, args)
	} else if function == "queryUserByUserId" { //find marbles for owner X using rich query
		return t.queryUserByUserId(stub, args)
	} else if function == "queryUsers" { //find marbles based on an ad hoc rich query
		return t.queryUsers(stub, args)
	} else if function == "transferUserByUserId" { //transfer all marbles of a certain color
		return t.transferUserByUserId(stub, args)
    }  
    fmt.Println("invoke did not find func: " + function) //error
	return shim.Error("Received unknown function invocation")
}
//根据用户ID修改用户信息
//参数说明{'userId',newusername','newuseraddress',
//      newgender','newusertype'}
//for example:{'sss','lucas','shanghai'}
func (t *SimpleChaincode) transferUserByUserId(stub shim.ChaincodeStubInterface, args []string) pb.Response {

	//   0       1
	// "userId", ""
	if len(args) <2 {
		return shim.Error("Incorrect number of arguments. Expecting 2")
	}
	userId := args[0]
	fmt.Println("- start transferMarble ")
	userAsBytes, err := stub.GetState(userId)
	if err != nil {
		return shim.Error("Failed to get marble:" + err.Error())
	} else if userAsBytes == nil {
		return shim.Error("user does not exist")
	}
	userToTransfer := user{}
	err = json.Unmarshal(userAsBytes, &userToTransfer) //unmarshal it aka JSON.parse()
	if err != nil {
		return shim.Error(err.Error())
	}

	if len(args[1])>0{
	   userToTransfer.UserName = strings.ToLower(args[1])
	}
	if len(args)>2{
		if(len(args[2])>0){
			userToTransfer.UserAddress=strings.ToLower(args[2])
		}
	}
	if(len(args)>3){
        if(len(args[3])>0){
			userToTransfer.Gender=strings.ToLower(args[3])
		}
	}
	if(len(args)>4){
        if(len(args[4])>0){
			userToTransfer.UserType=strings.ToLower(args[4])
		}
	}
	userJSONasBytes, _ := json.Marshal(userToTransfer)
	err = stub.PutState(userId, userJSONasBytes) //rewrite the user
	if err != nil {
		return shim.Error(err.Error())
	}
	fmt.Println("- end transferUser (success)")
	return shim.Success(nil)
}

// ============================================================
// 增加用户
// ============================================================
func (t *SimpleChaincode) AddUser(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var err error

	//   0       1       2     3
	// "", "blue", "35", "bob"
	if len(args) != 5 {
		return shim.Error("Incorrect number of arguments. Expecting 4")
	}

	// ==== Input sanitation ====
	fmt.Println("- start init marble")
	if len(args[0]) <= 0 {
		return shim.Error("1st argument must be a non-empty string")
	}
	if len(args[1]) <= 0 {
		return shim.Error("2nd argument must be a non-empty string")
	}
	if len(args[2]) <= 0 {
		return shim.Error("3rd argument must be a non-empty string")
	}
	if len(args[3]) <= 0 {
		return shim.Error("4th argument must be a non-empty string")
	}
	if len(args[4]) <= 0 {
		return shim.Error("4th argument must be a non-empty string")
	}
	userId := strings.ToLower(args[0])
	userName := strings.ToLower(args[1])
	userAddress := strings.ToLower(args[2])
	gender:=strings.ToLower(args[3])
	userType:=strings.ToLower(args[4])
	if err != nil {
		return shim.Error("3rd argument must be a numeric string")
	}

	// ==== Check if marble already exists ====
	marbleAsBytes, err := stub.GetState(userId)
	if err != nil {
		return shim.Error("Failed to get marble: " + err.Error())
	} else if marbleAsBytes != nil {
		fmt.Println("This marble already exists: " + userId)
		return shim.Error("This marble already exists: " + userId)
	}

	// ==== Create marble object and marshal to JSON ====
	objectType := "user"
	user := &user{objectType, userId , userName, userAddress,gender,userType}
	userJSONasBytes, err := json.Marshal(user)
	if err != nil {
		return shim.Error(err.Error())
	}

	// === Save marble to state ===
	err = stub.PutState(userId, userJSONasBytes)
	if err != nil {
		return shim.Error(err.Error())
	}

	// ==== Marble saved and indexed. Return success ====
	fmt.Println("- end init user")
	return shim.Success(nil)
}

// ==================================================
// 删除用户
// ==================================================
func (t *SimpleChaincode) delete(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var jsonResp string
	var userJSON user
	if len(args) != 1 {
		return shim.Error("Incorrect number of arguments. Expecting 1")
	}
	userId := args[0]

	// to maintain the color~name index, we need to read the marble first and get its color
	valAsbytes, err := stub.GetState(userId) //get the marble from chaincode state
	if err != nil {
		jsonResp = "{\"Error\":\"Failed to get state for " + userId + "\"}"
		return shim.Error(jsonResp)
	} else if valAsbytes == nil {
		jsonResp = "{\"Error\":\"Marble does not exist: " + userId + "\"}"
		return shim.Error(jsonResp)
	}

	err = json.Unmarshal([]byte(valAsbytes), &userJSON)
	if err != nil {
		jsonResp = "{\"Error\":\"Failed to decode JSON of: " + userId + "\"}"
		return shim.Error(jsonResp)
	}

	err = stub.DelState(userId) //remove the marble from chaincode state
	if err != nil {
		return shim.Error("Failed to delete state:" + err.Error())
	}

	// maintain the index
	// indexName := "color~name"
	// colorNameIndexKey, err := stub.CreateCompositeKey(indexName, []string{marbleJSON.Color, marbleJSON.Name})
	// if err != nil {
	// 	return shim.Error(err.Error())
	// }

	// //  Delete index entry to state.
	// err = stub.DelState(colorNameIndexKey)
	// if err != nil {
	// 	return shim.Error("Failed to delete state:" + err.Error())
	// }
	return shim.Success(nil)
}
// =========================================================================================
//根据用户ID查询
func (t *SimpleChaincode) queryUserByUserId(stub shim.ChaincodeStubInterface, args []string) pb.Response {

	//   0
	// "bob"
	if len(args) < 1 {
		return shim.Error("Incorrect number of arguments. Expecting 1")
	}

	userId := strings.ToLower(args[0])

	queryString := fmt.Sprintf("{\"selector\":{\"docType\":\"user\",\"userid\":\"%s\"}}", userId)

	queryResults, err := getQueryResultForQueryString(stub, queryString)
	if err != nil {
		return shim.Error(err.Error())
	}
	return shim.Success(queryResults)
}

// ===== Example: Ad hoc rich query ========================================================
//查询用户  rich query
// =========================================================================================
func (t *SimpleChaincode) queryUsers(stub shim.ChaincodeStubInterface, args []string) pb.Response {

	//   0
	// "queryString"
	if len(args) < 1 {
		return shim.Error("Incorrect number of arguments. Expecting 1")
	}

	queryString := args[0]

	queryResults, err := getQueryResultForQueryString(stub, queryString)
	if err != nil {
		return shim.Error(err.Error())
	}
	return shim.Success(queryResults)
}

// =========================================================================================
// 获得查询结果
// =========================================================================================
func getQueryResultForQueryString(stub shim.ChaincodeStubInterface, queryString string) ([]byte, error) {

	fmt.Printf("- getQueryResultForQueryString queryString:\n%s\n", queryString)

	resultsIterator, err := stub.GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	// buffer is a JSON array containing QueryRecords
	var buffer bytes.Buffer
	buffer.WriteString("[")

	bArrayMemberAlreadyWritten := false
	for resultsIterator.HasNext() {
		queryResultKey, queryResultRecord, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		// Add a comma before array members, suppress it for the first array member
		if bArrayMemberAlreadyWritten == true {
			buffer.WriteString(",")
		}
		buffer.WriteString("{\"Key\":")
		buffer.WriteString("\"")
		buffer.WriteString(queryResultKey)
		buffer.WriteString("\"")

		buffer.WriteString(", \"Record\":")
		// Record is a JSON object, so we write as-is
		buffer.WriteString(string(queryResultRecord))
		buffer.WriteString("}")
		bArrayMemberAlreadyWritten = true
	}
	buffer.WriteString("]")

	fmt.Printf("- getQueryResultForQueryString queryResult:\n%s\n", buffer.String())

	return buffer.Bytes(), nil
}
